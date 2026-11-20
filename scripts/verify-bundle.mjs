#!/usr/bin/env node
/**
 * 发布目录校验:结构、收录信息交叉一致性与三层清单。
 *
 * 查四类东西:
 *   结构    根目录该有的索引与清单都在,certs/ 下只有来源文件夹
 *   形状    assets/ 树的形状(与 scripts/verify-pull.mjs 同一套判定)
 *   一致性  assets.json 索引、catalog/ 登记副本与 assets/ 树三者互相对得上,标签取自 tags.json
 *   清单    三层清单的结构、覆盖范围与每个文件的 SHA-512,以及签名文件是否就位
 *
 * 只检查签名文件的存在与 DER 形状,CMS 验签由 CI 的 openssl 步骤完成,本脚本不实现验签,也不签名。
 *
 * 用法:
 *   node scripts/verify-bundle.mjs --dir dist/pages
 *   node scripts/verify-bundle.mjs --dir dist/pages --allow-unsigned-manifests
 *   node scripts/verify-bundle.mjs --dir dist/pages --json
 */

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readPresetTags } from './lib/catalog.mjs'
import { buildResult, problem, runCheckMain } from './lib/check-report.mjs'
import {
  COLLECTION_ID,
  EEC_FILE,
  MANIFEST_FILE,
  ROOT_CA_FILE,
  ROOT_CA_ID,
  isDir,
  isObject,
  listDirNames,
  listFileNames,
  readJsonFile,
} from './lib/collection.mjs'
import { verifyManifests } from './lib/manifest.mjs'
import { readCollectionMeta } from './lib/meta.mjs'
import { validateAssetsTree } from './lib/tree.mjs'

/** 发布目录根必须存在的文件。 */
const REQUIRED_FILES = [
  'meta.json',
  'tags.json',
  'assets.json',
  'assets/author_manifest.json',
  'catalog/removed.json',
  'catalog/index.json',
  'catalog/anomalies.json',
]

function usage() {
  process.stdout.write([
    '用法: node scripts/verify-bundle.mjs [选项]',
    '',
    '选项:',
    '  --dir <目录>                 发布目录,默认 dist/pages',
    '  --allow-unsigned-manifests   允许清单缺签名,降级为警告(本地骨架校验用)',
    '  --json                       以 JSON 输出校验结果',
    '  --help                       显示本说明',
    '',
    '退出码: 0 通过,1 有 error 级问题,2 参数错误或运行失败',
    '',
  ].join('\n'))
}

/** 收集 assets/ 树里的 作者/包标识 集合。 */
function collectTreeKeys(root) {
  const keys = new Set()
  const assetsDir = join(root, 'assets')
  for (const author of listDirNames(assetsDir)) {
    for (const packageName of listDirNames(join(assetsDir, author))) {
      keys.add(author + '/' + packageName)
    }
  }
  return keys
}

/** 从 catalog/ 副本里读出 作者/包标识 到标签的映射。 */
function collectRegistration(root, problems) {
  const tags = new Map()
  const catalogDir = join(root, 'catalog')
  if (!isDir(catalogDir)) {
    problems.push(problem('error', 'CATALOG_COPY_MISSING', '发布目录缺 catalog/ 登记副本', 'catalog'))
    return tags
  }
  for (const author of listDirNames(catalogDir)) {
    const authorDir = join(catalogDir, author)
    const authorFile = join(authorDir, 'author.json')
    if (!existsSync(authorFile)) {
      problems.push(problem('error', 'CATALOG_AUTHOR_FILE_MISSING', '登记副本的作者目录缺 author.json', 'catalog/' + author))
      continue
    }
    let username = author
    try {
      const data = readJsonFile(authorFile)
      if (isObject(data) && typeof data.username === 'string') username = data.username
    } catch (error) {
      problems.push(problem('error', 'CATALOG_AUTHOR_FILE_INVALID', error.message, 'catalog/' + author + '/author.json'))
      continue
    }
    if (username !== author) {
      problems.push(problem('error', 'CATALOG_AUTHOR_NAME_MISMATCH', '目录名 ' + author + ' 与 author.json 的 username ' + username + ' 不一致', 'catalog/' + author))
    }
    for (const packageName of listDirNames(authorDir)) {
      const packageFile = join(authorDir, packageName, 'package.json')
      const where = 'catalog/' + author + '/' + packageName + '/package.json'
      if (!existsSync(packageFile)) {
        problems.push(problem('error', 'CATALOG_PACKAGE_FILE_MISSING', '登记副本的包目录缺 package.json', where))
        continue
      }
      try {
        const data = readJsonFile(packageFile)
        if (!isObject(data)) {
          problems.push(problem('error', 'CATALOG_PACKAGE_NOT_OBJECT', 'package.json 必须是 JSON 对象', where))
          continue
        }
        if (data.id !== packageName) {
          problems.push(problem('error', 'CATALOG_PACKAGE_ID_MISMATCH', 'package.json 的 id ' + String(data.id) + ' 与目录名 ' + packageName + ' 不一致', where))
        }
        tags.set(author + '/' + packageName, Array.isArray(data.tags) ? data.tags : [])
      } catch (error) {
        problems.push(problem('error', 'CATALOG_PACKAGE_FILE_INVALID', error.message, where))
      }
    }
  }
  return tags
}

/** 读取发布目录根的索引条目,失败时返回空数组(形状问题由树校验报)。 */
function readIndexEntries(root) {
  try {
    const data = readJsonFile(join(root, 'assets.json'))
    return Array.isArray(data) ? data.filter((item) => isObject(item) && typeof item.asset_id === 'string' && typeof item.author === 'string') : []
  } catch {
    return []
  }
}

/**
 * 检查 certs/ 布局:根下只允许来源文件夹,本合集的 EEC 就位,且不随发布目录下发根证书。
 * 根证书是资产侧唯一信任锚,锚只能有一处也不由页面下发,所以它只留在仓库的 certs/dsc-humanize/ 里。
 */
function checkBundleCerts(root, problems) {
  const certsDir = join(root, 'certs')
  if (!isDir(certsDir)) {
    problems.push(problem('error', 'BUNDLE_CERTS_MISSING', '发布目录缺 certs/ 信任材料', 'certs'))
    return
  }
  for (const name of listFileNames(certsDir)) {
    problems.push(problem('error', 'BUNDLE_CERTS_STRAY_FILE', 'certs/ 下只允许来源文件夹,发现散落文件 ' + name, 'certs/' + name))
  }
  const eecRel = COLLECTION_ID + '/' + EEC_FILE
  if (!existsSync(join(certsDir, ...eecRel.split('/')))) {
    problems.push(problem('error', 'BUNDLE_CERTS_FILE_MISSING', '缺信任材料 certs/' + eecRel, 'certs/' + eecRel))
  }
  if (existsSync(join(certsDir, ROOT_CA_ID))) {
    problems.push(
      problem('error', 'BUNDLE_ROOT_CA_PRESENT', '发布目录不得下发根证书:锚只在本仓库 certs/' + ROOT_CA_ID, 'certs/' + ROOT_CA_ID),
    )
  }
}

process.exitCode = runCheckMain({
  usage,
  flags: {
    dir: { kind: 'value', default: 'dist/pages' },
    allowUnsignedManifests: { kind: 'flag' },
    json: { kind: 'flag' },
    help: { kind: 'flag' },
  },
  run(options) {
    const dir = resolve(options.dir)
    if (!isDir(dir)) throw new Error('发布目录不存在:' + dir)

    const problems = []
    for (const rel of REQUIRED_FILES) {
      if (!existsSync(join(dir, ...rel.split('/')))) {
        problems.push(problem('error', 'BUNDLE_FILE_MISSING', '发布目录缺 ' + rel, rel))
      }
    }
    if (!existsSync(join(dir, MANIFEST_FILE))) {
      problems.push(problem('error', 'BUNDLE_MANIFEST_MISSING', '发布目录缺 L1 清单', MANIFEST_FILE))
    }

    const collectionMeta = readCollectionMeta(join(dir, 'meta.json'), problems)
    const presetTags = readPresetTags(join(dir, 'tags.json'), problems)

    const treeStats = validateAssetsTree(dir, {
      problems,
      requireIndex: true,
      expectedFormatVersion: collectionMeta?.assetFormatVersion ?? null,
    })

    const treeKeys = collectTreeKeys(dir)
    const registration = collectRegistration(dir, problems)
    for (const key of treeKeys) {
      if (!registration.has(key)) {
        problems.push(problem('error', 'CATALOG_TREE_MISMATCH', key + ' 在 assets/ 树里,但没有登记副本', 'catalog'))
      }
    }
    for (const key of registration.keys()) {
      if (!treeKeys.has(key)) {
        problems.push(problem('error', 'CATALOG_TREE_MISMATCH', key + ' 有登记副本,但不在 assets/ 树里', 'catalog'))
      }
    }

    const allowedTags = new Set(presetTags)
    for (const entry of readIndexEntries(dir)) {
      const key = entry.author + '/' + entry.asset_id
      const tags = Array.isArray(entry.tag) ? entry.tag : []
      for (const tag of tags) {
        if (typeof tag === 'string' && !allowedTags.has(tag)) {
          problems.push(problem('error', 'ASSETS_INDEX_TAG_UNKNOWN', key + ' 的标签 ' + JSON.stringify(tag) + ' 不在 tags.json 的预设词表内', 'assets.json'))
        }
      }
      const registered = registration.get(key)
      if (registered) {
        const left = [...tags].filter((tag) => typeof tag === 'string').sort().join(',')
        const right = [...registered].filter((tag) => typeof tag === 'string').sort().join(',')
        if (left !== right) {
          problems.push(problem('error', 'ASSETS_INDEX_TAG_MISMATCH', key + ' 的标签与登记副本不一致', 'assets.json'))
        }
      }
    }

    checkBundleCerts(dir, problems)

    const manifests = verifyManifests({
      root: dir,
      problems,
      allowUnsigned: options.allowUnsignedManifests === true,
    })

    return buildResult({
      check: 'bundle',
      title: '发布目录结构与三层清单',
      target: dir,
      problems,
      stats: {
        authors: treeStats.authors,
        packages: treeStats.packages,
        versions: treeStats.versions,
        files: treeStats.files,
        indexEntries: treeStats.indexEntries,
        presetTags: presetTags.length,
        manifests,
      },
    })
  },
})
