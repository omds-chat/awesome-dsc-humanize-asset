#!/usr/bin/env node
/**
 * 按 catalog 从作者站点拉取资产包,整理成发布目录,并生成三层清单。
 *
 * 做四件事:校验登记与信任材料、按 base_url 拉取每个包的全部版本与包内文件、写索引与登记副本、生成三层清单。
 * 本脚本不签名,也不实现任何密码学:清单签名由 CI 在本脚本之后用 openssl 完成,命令见 .github/pipeline.README.md。
 * 因此脚本结束时清单已就位但签名未就位,这一步缺省会让 verify-bundle 报 MANIFEST_SIG_MISSING,属预期行为。
 *
 * 两类问题分开处理:
 *   登记不合规(catalog/ 的文件本身不合法、标签越界、缺 EEC 证书)      构建中止,一个包都不发布
 *   运行期异常(拉取失败、远端索引或包形状不合规、包内缺元数据)          只剔除该包,其余照常发布,写入 catalog/anomalies.json
 *
 * 用法:
 *   node scripts/build-from-catalog.mjs --out dist/pages
 *   PUBLISHED_BASE_URL=https://omds-chat.github.io/awesome-dsc-humanize-asset/ \
 *     node scripts/build-from-catalog.mjs --catalog catalog --certs certs --meta site/meta.json --tags site/tags.json --out dist/pages
 */

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { checkPresetTags, checkRemoved, readCatalog, readPresetTags } from './lib/catalog.mjs'
import { checkCerts } from './lib/certs.mjs'
import { problem } from './lib/check-report.mjs'
import {
  ASSET_MANIFEST_FILE,
  AUTHOR_MANIFEST_FILE,
  CATALOG_ANOMALIES_FILE,
  CATALOG_INDEX_FILE,
  COLLECTION_ID,
  VERSIONS_FILE,
  copyTree,
  isDir,
  resetDir,
  writeJsonFile,
} from './lib/collection.mjs'
import { buildLayerManifests, listLayerTargets } from './lib/manifest.mjs'
import { readCollectionMeta } from './lib/meta.mjs'
import { DEFAULT_TIMEOUT_MS, pullPackage } from './lib/remote.mjs'

function usage() {
  process.stdout.write([
    '用法: node scripts/build-from-catalog.mjs [选项]',
    '',
    '选项:',
    '  --catalog <目录>         登记目录,默认 catalog',
    '  --certs <目录>           信任材料目录,默认 certs',
    '  --meta <文件>            合集元数据,默认 site/meta.json',
    '  --tags <文件>            预设标签词表,默认 site/tags.json',
    '  --out <目录>             发布目录,默认 dist/pages;每次全量重建',
    '  --published-base <地址>  已发布站点基址,用于沿用三层清单的 revision',
    '  --timeout <毫秒>         单请求超时,默认 20000',
    '  --json                   以 JSON 输出构建摘要',
    '  --help                   显示本说明',
    '',
    '环境变量:',
    '  PUBLISHED_BASE_URL  等价于 --published-base',
    '',
    '退出码: 0 构建完成,1 有 error 级问题(不发布),2 参数错误或运行失败',
    '',
  ].join('\n'))
}

/** 解析命令行参数。 */
function parseArgs(argv) {
  const options = {
    catalog: 'catalog',
    certs: 'certs',
    meta: join('site', 'meta.json'),
    tags: join('site', 'tags.json'),
    out: join('dist', 'pages'),
    publishedBase: null,
    timeout: null,
    json: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const separator = arg.indexOf('=')
    const flag = separator === -1 ? arg : arg.slice(0, separator)
    const inline = separator === -1 ? null : arg.slice(separator + 1)
    const take = () => {
      if (inline !== null) return inline
      index += 1
      const value = argv[index]
      if (value === undefined) throw new Error(flag + ' 缺少取值')
      return value
    }
    switch (flag) {
      case '--catalog': options.catalog = take(); break
      case '--certs': options.certs = take(); break
      case '--meta': options.meta = take(); break
      case '--tags': options.tags = take(); break
      case '--out': options.out = take(); break
      case '--published-base': options.publishedBase = take(); break
      case '--timeout': options.timeout = take(); break
      case '--json': options.json = true; break
      case '--help':
      case '-h': options.help = true; break
      default: throw new Error('未知参数 ' + arg)
    }
  }
  return options
}

/** 三段数字版本号比较,用于把版本列表按降序写入发布目录。 */
function compareVersions(left, right) {
  const a = left.split('.').map((item) => Number(item))
  const b = right.split('.').map((item) => Number(item))
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}

/**
 * 从已发布站点读取三层清单的上一次 revision。
 * 取不到或结构不对时返回空表,该层 revision 从 1 开始。
 */
async function loadPreviousManifests({ publishedBase, layerRels, problems, timeoutMs }) {
  const map = new Map()
  if (!publishedBase) {
    problems.push(problem('warning', 'PUBLISHED_BASE_MISSING', '未提供已发布站点基址,三层清单的 revision 都从 1 开始', null))
    return map
  }
  const base = publishedBase.replace(/\/+$/, '')
  await Promise.all(
    layerRels.map(async (layerRel) => {
      const url = base + '/' + (layerRel ? layerRel + '/' : '') + 'manifest.json'
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
        if (!response.ok) return
        const data = await response.json()
        if (data && Array.isArray(data.files)) map.set(layerRel, data)
      } catch {
        return
      }
    }),
  )
  if (map.size === 0) {
    problems.push(problem('warning', 'PREVIOUS_MANIFEST_MISSING', '已发布站点没有可用的清单,三层清单的 revision 从 1 开始', null))
  }
  return map
}

/** 把拉取到的包写进 assets/ 树:版本目录就是资产包本身,内容按字节原样落盘。 */
function writePackagesTree({ staging, included, progress }) {
  const byAuthor = new Map()
  for (const item of included) {
    const versions = [...item.pulled.versions].sort(compareVersions).reverse()
    const packageDir = join(staging, 'assets', item.author, item.id)
    let fileCount = 0
    for (const version of versions) {
      const contents = item.pulled.packages.get(version)
      for (const [rel, bytes] of contents) {
        const target = join(packageDir, version, ...rel.split('/'))
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, bytes)
        fileCount += 1
      }
    }
    writeJsonFile(join(packageDir, VERSIONS_FILE), { latest: item.pulled.latest, versions })
    progress.versions += versions.length
    progress.files += fileCount
    if (!byAuthor.has(item.author)) byAuthor.set(item.author, [])
    byAuthor.get(item.author).push(item.id)
  }
  return byAuthor
}

/** 写作者清单、包清单与目录索引。 */
function writeIndexes({ staging, byAuthor, catalog, included }) {
  const authorNames = [...byAuthor.keys()].sort()
  for (const author of authorNames) {
    writeJsonFile(join(staging, 'assets', author, ASSET_MANIFEST_FILE), [...byAuthor.get(author)].sort())
  }
  writeJsonFile(
    join(staging, 'assets', AUTHOR_MANIFEST_FILE),
    authorNames.map((username) => ({
      username,
      profile: catalog.authors.find((item) => item.username === username)?.profile ?? '',
    })),
  )
  writeJsonFile(
    join(staging, 'assets.json'),
    included
      .map((item) => ({
        asset_id: item.id,
        author: item.author,
        tag: [...item.tags],
        types: item.pulled.types.get(item.pulled.latest) ?? [],
      }))
      .sort((left, right) => (left.asset_id < right.asset_id ? -1 : left.asset_id > right.asset_id ? 1 : left.author < right.author ? -1 : 1)),
  )
}

/** 生成 catalog/index.json:作者与包的汇总,只供本站自查与速览,不进任何清单。 */
function buildCatalogIndex({ collectionMeta, releaseTag, catalog, byAuthor, included }) {
  const authors = catalog.authors
    .filter((author) => byAuthor.has(author.username))
    .map((author) => ({ username: author.username, profile: author.profile, packages: [...byAuthor.get(author.username)].sort() }))
    .sort((left, right) => (left.username < right.username ? -1 : 1))
  const packages = included
    .map((item) => ({
      asset_id: item.id,
      author: item.author,
      latest: item.pulled.latest,
      versions: item.pulled.versions.length,
      types: item.pulled.types.get(item.pulled.latest) ?? [],
      tags: [...item.tags],
    }))
    .sort((left, right) => (left.asset_id < right.asset_id ? -1 : 1))
  return {
    collection: COLLECTION_ID,
    release: releaseTag,
    assetSpecVersion: collectionMeta?.assetSpecVersion ?? null,
    assetFormatVersion: collectionMeta?.assetFormatVersion ?? null,
    authors,
    packages,
  }
}

/** 把登记副本复制进发布目录,并删掉本次剔除的作者与包,保证副本与 assets/ 树一致。 */
function copyCatalogTree({ catalogDir, staging, catalog, byAuthor }) {
  const destDir = join(staging, 'catalog')
  copyTree(catalogDir, destDir)
  for (const author of catalog.authors) {
    const copyAuthorDir = join(destDir, author.username)
    if (!existsSync(copyAuthorDir)) continue
    const kept = new Set(byAuthor.get(author.username) ?? [])
    if (kept.size === 0) {
      rmSync(copyAuthorDir, { recursive: true, force: true })
      continue
    }
    for (const item of author.packages) {
      if (kept.has(item.id)) continue
      rmSync(join(copyAuthorDir, item.id), { recursive: true, force: true })
    }
  }
}

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    process.stderr.write('构建失败:' + error.message + '\n\n')
    usage()
    return 2
  }
  if (options.help) {
    usage()
    return 0
  }

  const timeoutMs = options.timeout === null ? DEFAULT_TIMEOUT_MS : Number(options.timeout)
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    process.stderr.write('构建失败:--timeout 必须是正数(毫秒)\n')
    return 2
  }

  const catalogDir = resolve(options.catalog)
  const certsDir = resolve(options.certs)
  const metaPath = resolve(options.meta)
  const tagsPath = resolve(options.tags)
  const outDir = resolve(options.out)
  const publishedBase = options.publishedBase || process.env.PUBLISHED_BASE_URL || process.env.PUBLISHED_BASE || null
  const releaseTag = process.env.GITHUB_REF_NAME || process.env.RELEASE_TAG || null
  if (!isDir(catalogDir)) {
    process.stderr.write('构建失败:catalog 目录不存在 ' + catalogDir + '\n')
    return 2
  }

  const problems = []
  const presetTags = readPresetTags(tagsPath, problems)
  const collectionMeta = readCollectionMeta(metaPath, problems)
  const catalog = readCatalog({ catalogDir, problems })
  checkPresetTags(catalog.packages, presetTags, problems)
  const removed = checkRemoved({ catalogDir, packages: catalog.packages, problems })
  const certStats = checkCerts({ certsDir, problems })
  if (!certStats.eec) {
    problems.push(problem('error', 'EEC_REQUIRED', '缺本合集终端签名证书,清单无法签名:' + 'certs/' + COLLECTION_ID, 'certs/' + COLLECTION_ID))
  }

  const registrationErrors = problems.filter((item) => item.level === 'error')
  if (registrationErrors.length > 0) {
    process.stderr.write(
      'catalog 登记或信任材料不合规,共 ' + registrationErrors.length + ' 个错误,未开始拉取:\n' +
        registrationErrors.map((item) => '[错误] ' + item.code + ' ' + item.message).join('\n') + '\n',
    )
    return 1
  }

  const staging = outDir + '.staging-' + process.pid + '-' + Date.now()
  const anomalies = []
  const included = []
  const progress = { versions: 0, files: 0 }

  try {
    resetDir(staging)

    for (const item of catalog.packages) {
      try {
        const pulled = await pullPackage({
          baseUrl: item.baseUrl,
          id: item.id,
          expectedFormatVersion: collectionMeta?.assetFormatVersion ?? null,
          timeoutMs,
        })
        included.push({ ...item, pulled })
      } catch (error) {
        const stage = error && error.stage ? error.stage : 'fetch'
        anomalies.push({ author: item.author, asset_id: item.id, stage, message: error.message })
        problems.push(
          problem('warning', 'PACKAGE_EXCLUDED', '包 ' + item.author + '/' + item.id + ' 已从本次发布剔除(阶段 ' + stage + '):' + error.message, item.packageRel),
        )
      }
    }

    const byAuthor = writePackagesTree({ staging, included, progress })
    writeIndexes({ staging, byAuthor, catalog, included })

    writeJsonFile(join(staging, 'meta.json'), collectionMeta)
    writeJsonFile(join(staging, 'tags.json'), presetTags)

    copyCatalogTree({ catalogDir, staging, catalog, byAuthor })
    writeJsonFile(
      join(staging, 'catalog', CATALOG_INDEX_FILE),
      buildCatalogIndex({ collectionMeta, releaseTag, catalog, byAuthor, included }),
    )
    writeJsonFile(join(staging, 'catalog', CATALOG_ANOMALIES_FILE), {
      collection: COLLECTION_ID,
      release: releaseTag,
      excluded: anomalies.map((item) => ({ ...item })),
    })

    copyTree(join(certsDir, COLLECTION_ID), join(staging, 'certs', COLLECTION_ID))

    const targets = listLayerTargets(staging)
    const previous = await loadPreviousManifests({
      publishedBase,
      layerRels: targets.map((target) => target.layerRel),
      problems,
      timeoutMs,
    })
    const manifests = buildLayerManifests({
      root: staging,
      previousResolver: (layerRel) => previous.get(layerRel) ?? null,
      problems,
    })

    const errors = problems.filter((item) => item.level === 'error')
    if (errors.length > 0) {
      rmSync(staging, { recursive: true, force: true })
      process.stderr.write(
        '构建失败,共 ' + errors.length + ' 个错误,未发布:\n' +
          errors.map((item) => '[错误] ' + item.code + ' ' + item.message).join('\n') + '\n',
      )
      return 1
    }

    rmSync(outDir, { recursive: true, force: true })
    mkdirSync(dirname(outDir), { recursive: true })
    renameSync(staging, outDir)

    const stats = {
      authors: byAuthor.size,
      packages: included.length,
      versions: progress.versions,
      files: progress.files,
      removed,
      excluded: anomalies.length,
    }

    if (options.json) {
      process.stdout.write(
        JSON.stringify(
          {
            ok: true,
            out: outDir,
            publishedBase,
            stats,
            excluded: anomalies,
            manifests,
            signingPending: true,
            warnings: problems.filter((item) => item.level === 'warning'),
          },
          null,
          2,
        ) + '\n',
      )
      return 0
    }

    process.stdout.write(
      '发布目录已生成:' + outDir + '\n' +
        '收录 ' + stats.authors + ' 位作者的 ' + stats.packages + ' 个包、' + stats.versions + ' 个版本、' + stats.files + ' 个包内文件;' +
        'removed.json 记录 ' + removed + ' 条;本次剔除 ' + stats.excluded + ' 个包\n',
    )
    for (const item of anomalies) {
      process.stdout.write('[剔除] ' + item.author + '/' + item.asset_id + '(阶段 ' + item.stage + '):' + item.message + '\n')
    }
    for (const item of manifests) {
      process.stdout.write('清单 ' + item.layer + ' ' + item.dir + ':revision ' + item.revision + ',' + item.files + ' 个文件' + (item.changed ? '(已更新)' : '(未变)') + '\n')
    }
    process.stdout.write(
      '清单尚未签名:本脚本不签名。由 CI 用本合集 EEC 逐层签名,命令见 .github/pipeline.README.md;\n' +
        '本地用 --allow-unsigned-manifests 校验结构,签名后就位再跑不带该开关的 verify:bundle。\n',
    )
    return 0
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }
}

try {
  process.exitCode = await main()
} catch (error) {
  process.stderr.write('构建失败:' + (error && error.message ? error.message : String(error)) + '\n')
  process.exitCode = 1
}
