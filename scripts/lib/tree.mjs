/**
 * 发布目录里 assets/ 树的形状校验。
 *
 * 树按「作者 / 包标识 / 版本」三层组织:作者目录一份 asset_manifest.json,包目录一份 versions.json,
 * 版本目录就是资产包本身,内容与作者站点上那一份逐字节一致。
 * 本模块只判定形状与一致性(声明与目录、索引与树、元数据与目录名),不做签名与验签。
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ASSET_ID_RE, splitContentPath, validateContentFile, validateMetadata, validatePackageLayout } from './asset-package.mjs'
import { problem } from './check-report.mjs'
import { validateVersionIndex } from './versions.mjs'
import {
  ASSET_MANIFEST_FILE,
  AUTHOR_MANIFEST_FILE,
  CONTENT_TYPES,
  VERSIONS_FILE,
  isObject,
  listDirNames,
  listFilesRecursive,
  readJsonFile,
} from './collection.mjs'

/** 读取并校验作者清单 assets/author_manifest.json,返回作者名数组。 */
function readAuthorManifest(root, problems) {
  const path = join(root, 'assets', AUTHOR_MANIFEST_FILE)
  const where = 'assets/' + AUTHOR_MANIFEST_FILE
  if (!existsSync(path)) {
    problems.push(problem('error', 'AUTHOR_MANIFEST_MISSING', '缺作者清单:' + where, where))
    return []
  }
  let data
  try {
    data = readJsonFile(path)
  } catch (error) {
    problems.push(problem('error', 'AUTHOR_MANIFEST_INVALID', error.message, where))
    return []
  }
  if (!Array.isArray(data)) {
    problems.push(problem('error', 'AUTHOR_MANIFEST_NOT_ARRAY', '作者清单的顶层必须是数组', where))
    return []
  }
  const names = []
  const seen = new Set()
  for (const [index, item] of data.entries()) {
    const entryWhere = where + '[' + index + ']'
    if (!isObject(item)) {
      problems.push(problem('error', 'AUTHOR_ENTRY_NOT_OBJECT', '作者条目必须是 JSON 对象', entryWhere))
      continue
    }
    const extra = Object.keys(item).filter((key) => key !== 'username' && key !== 'profile')
    if (extra.length > 0) {
      problems.push(problem('error', 'AUTHOR_ENTRY_EXTRA_FIELD', '作者条目只允许 username 与 profile,多出 ' + extra.join(','), entryWhere))
    }
    if (typeof item.username !== 'string' || item.username.length === 0) {
      problems.push(problem('error', 'AUTHOR_ENTRY_USERNAME_INVALID', 'username 必须是非空字符串', entryWhere))
      continue
    }
    if (typeof item.profile !== 'string' || item.profile.trim().length === 0) {
      problems.push(problem('error', 'AUTHOR_ENTRY_PROFILE_INVALID', 'profile 必须是非空字符串', entryWhere))
    }
    if (seen.has(item.username)) {
      problems.push(problem('error', 'AUTHOR_ENTRY_DUPLICATE', '作者清单重复出现 ' + item.username, entryWhere))
      continue
    }
    seen.add(item.username)
    names.push(item.username)
  }
  const sorted = [...names].sort()
  if (sorted.join(',') !== names.join(',')) {
    problems.push(problem('warning', 'AUTHOR_MANIFEST_UNSORTED', '作者清单应按 username 升序排列', where))
  }
  return names
}

/** 读取一个作者目录下的 asset_manifest.json,返回包标识数组。 */
function readAssetManifest(authorDir, author, problems) {
  const path = join(authorDir, ASSET_MANIFEST_FILE)
  const where = 'assets/' + author + '/' + ASSET_MANIFEST_FILE
  if (!existsSync(path)) {
    problems.push(problem('error', 'ASSET_MANIFEST_MISSING', '作者目录缺包清单:' + where, where))
    return []
  }
  let data
  try {
    data = readJsonFile(path)
  } catch (error) {
    problems.push(problem('error', 'ASSET_MANIFEST_INVALID', error.message, where))
    return []
  }
  if (!Array.isArray(data)) {
    problems.push(problem('error', 'ASSET_MANIFEST_NOT_ARRAY', '包清单的顶层必须是包标识数组', where))
    return []
  }
  const ids = []
  const seen = new Set()
  for (const item of data) {
    if (typeof item !== 'string' || !ASSET_ID_RE.test(item)) {
      problems.push(problem('error', 'ASSET_MANIFEST_ENTRY_INVALID', '包清单的元素必须是合法包标识,当前为 ' + JSON.stringify(item), where))
      continue
    }
    if (seen.has(item)) {
      problems.push(problem('error', 'ASSET_MANIFEST_ENTRY_DUPLICATE', '包清单重复出现 ' + item, where))
      continue
    }
    seen.add(item)
    ids.push(item)
  }
  const sorted = [...ids].sort()
  if (sorted.join(',') !== ids.join(',')) {
    problems.push(problem('warning', 'ASSET_MANIFEST_UNSORTED', '包清单应按包标识升序排列', where))
  }
  return ids
}

/** 读取包目录的 versions.json:latest 必须在列表内,版本号互不重复;发布目录里不允许 files 字段。 */
function readVersions(packageDir, packageRel, problems) {
  const path = join(packageDir, VERSIONS_FILE)
  const where = packageRel + '/' + VERSIONS_FILE
  if (!existsSync(path)) {
    problems.push(problem('error', 'VERSIONS_FILE_MISSING', '包目录缺 ' + VERSIONS_FILE, where))
    return null
  }
  let data
  try {
    data = readJsonFile(path)
  } catch (error) {
    problems.push(problem('error', 'VERSIONS_FILE_INVALID', error.message, where))
    return null
  }
  return validateVersionIndex(data, { where, problems, allowFiles: false })
}

/** 校验一个版本目录:它就是资产包本身,包根条目与类型声明双向一致。 */
function validateVersion({ versionDir, versionRel, packageId, version, expectedFormatVersion, problems }) {
  const files = listFilesRecursive(versionDir)
  if (files.length === 0) {
    problems.push(problem('error', 'VERSION_DIR_EMPTY', '版本目录为空', versionRel))
    return { types: [], contents: 0, files: 0 }
  }

  let metadata = null
  const assetPath = join(versionDir, 'asset.json')
  if (!existsSync(assetPath)) {
    problems.push(problem('error', 'METADATA_FILE_MISSING', '版本目录缺 asset.json', versionRel))
  } else {
    let data
    try {
      data = readJsonFile(assetPath)
    } catch (error) {
      problems.push(problem('error', 'METADATA_FILE_INVALID', error.message, versionRel + '/asset.json'))
      data = null
    }
    if (data !== null) {
      metadata = validateMetadata(data, {
        expectedId: packageId,
        expectedFormatVersion,
        where: versionRel + '/asset.json',
        problems,
      })
      if (metadata && metadata.version !== version) {
        problems.push(
          problem('error', 'METADATA_VERSION_MISMATCH', '元数据 version 为 ' + metadata.version + ',与目录名 ' + version + ' 不一致', versionRel + '/asset.json'),
        )
      }
    }
  }

  const discovered = new Set()
  for (const rel of files) {
    const split = splitContentPath(rel)
    if (split) discovered.add(split.type)
  }
  const declaredTypes = metadata ? metadata.types : [...discovered]
  const layout = validatePackageLayout({ files, types: declaredTypes, where: versionRel, problems })

  const seenIds = new Map()
  let contents = 0
  for (const item of layout.contents) {
    const filePath = join(versionDir, ...item.path.split('/'))
    const where = versionRel + '/' + item.path
    let data
    try {
      data = readJsonFile(filePath)
    } catch (error) {
      problems.push(problem('error', 'CONTENT_FILE_INVALID', error.message, where))
      continue
    }
    const id = validateContentFile(data, { where, problems })
    if (!id) continue
    contents += 1
    const key = item.type + '/' + id
    if (seenIds.has(key)) {
      problems.push(problem('error', 'CONTENT_ID_DUPLICATE', '同一类型内内容标识重复:' + id + ',已出现在 ' + seenIds.get(key), where))
      continue
    }
    seenIds.set(key, item.path)
  }

  return { types: metadata ? metadata.types : [...discovered], contents, files: files.length }
}

/** 读取并校验发布目录根的 assets.json 索引。 */
function readIndex(root, problems) {
  const path = join(root, 'assets.json')
  const where = 'assets.json'
  if (!existsSync(path)) return null
  let data
  try {
    data = readJsonFile(path)
  } catch (error) {
    problems.push(problem('error', 'ASSETS_INDEX_INVALID', error.message, where))
    return null
  }
  if (!Array.isArray(data)) {
    problems.push(problem('error', 'ASSETS_INDEX_NOT_ARRAY', 'assets.json 的顶层必须是数组', where))
    return null
  }
  const entries = []
  const seen = new Set()
  for (const [index, item] of data.entries()) {
    const entryWhere = where + '[' + index + ']'
    if (!isObject(item)) {
      problems.push(problem('error', 'ASSETS_INDEX_ENTRY_NOT_OBJECT', '索引条目必须是 JSON 对象', entryWhere))
      continue
    }
    const extra = Object.keys(item).filter((key) => !['asset_id', 'author', 'tag', 'types'].includes(key))
    if (extra.length > 0) {
      problems.push(problem('error', 'ASSETS_INDEX_ENTRY_EXTRA_FIELD', '索引条目出现规定之外的字段 ' + extra.join(','), entryWhere))
    }
    if (typeof item.asset_id !== 'string' || !ASSET_ID_RE.test(item.asset_id)) {
      problems.push(problem('error', 'ASSETS_INDEX_ID_INVALID', 'asset_id 必须是合法包标识', entryWhere))
      continue
    }
    if (typeof item.author !== 'string' || item.author.trim().length === 0) {
      problems.push(problem('error', 'ASSETS_INDEX_AUTHOR_INVALID', 'author 必须是非空字符串', entryWhere))
      continue
    }
    const tags = []
    if (!Array.isArray(item.tag)) {
      problems.push(problem('error', 'ASSETS_INDEX_TAG_INVALID', 'tag 必须是数组', entryWhere))
    } else {
      for (const tag of item.tag) {
        if (typeof tag !== 'string' || tag.trim().length === 0) {
          problems.push(problem('error', 'ASSETS_INDEX_TAG_INVALID', 'tag 的元素必须是非空字符串', entryWhere))
        } else if (tags.includes(tag)) {
          problems.push(problem('error', 'ASSETS_INDEX_TAG_DUPLICATE', 'tag 重复出现 ' + tag, entryWhere))
        } else {
          tags.push(tag)
        }
      }
    }
    const types = []
    if (!Array.isArray(item.types) || item.types.length === 0) {
      problems.push(problem('error', 'ASSETS_INDEX_TYPES_INVALID', 'types 必须是非空数组', entryWhere))
    } else {
      for (const type of item.types) {
        if (!CONTENT_TYPES.includes(type)) {
          problems.push(problem('error', 'ASSETS_INDEX_TYPE_UNKNOWN', 'types 出现四类之外的取值 ' + JSON.stringify(type), entryWhere))
        } else if (types.includes(type)) {
          problems.push(problem('error', 'ASSETS_INDEX_TYPE_DUPLICATE', 'types 重复出现 ' + type, entryWhere))
        } else {
          types.push(type)
        }
      }
    }
    const key = item.author + '/' + item.asset_id
    if (seen.has(key)) {
      problems.push(problem('error', 'ASSETS_INDEX_DUPLICATE', '索引重复记录 ' + key, entryWhere))
      continue
    }
    seen.add(key)
    entries.push({ key, assetId: item.asset_id, author: item.author, tags, types })
  }
  return entries
}

/**
 * 校验发布目录的 assets/ 树。
 * @param {string} root 发布目录根
 * @param {object} context 上下文
 * @param {Array<object>} context.problems 问题收集数组
 * @param {boolean} [context.requireIndex] 是否要求 assets.json 存在
 * @param {string|null} [context.expectedFormatVersion] 合集接受的格式版本,取自 meta.json
 * @returns {object} 统计数字
 */
export function validateAssetsTree(root, { problems, requireIndex = false, expectedFormatVersion = null }) {
  const stats = { authors: 0, packages: 0, versions: 0, files: 0, indexEntries: 0 }
  const assetsDir = join(root, 'assets')
  if (!existsSync(assetsDir)) {
    problems.push(problem('error', 'ASSETS_DIR_MISSING', '发布目录缺 assets/ 树', 'assets'))
    return stats
  }

  const declaredAuthors = readAuthorManifest(root, problems)
  const authorDirs = listDirNames(assetsDir)
  for (const author of authorDirs) {
    if (!declaredAuthors.includes(author)) {
      problems.push(problem('error', 'AUTHOR_UNDECLARED', '作者目录 ' + author + ' 未出现在 assets/' + AUTHOR_MANIFEST_FILE + ' 中', 'assets/' + author))
    }
  }
  for (const author of declaredAuthors) {
    if (!authorDirs.includes(author)) {
      problems.push(problem('error', 'AUTHOR_DIR_MISSING', '作者清单声明的 ' + author + ' 没有对应目录', 'assets/' + author))
    }
  }

  const treeTypes = new Map()
  for (const author of authorDirs) {
    stats.authors += 1
    const authorDir = join(assetsDir, author)
    const declaredPackages = readAssetManifest(authorDir, author, problems)
    const packageDirs = listDirNames(authorDir)
    for (const packageName of packageDirs) {
      if (!declaredPackages.includes(packageName)) {
        problems.push(problem('error', 'PACKAGE_UNDECLARED', '包目录 ' + packageName + ' 未出现在包清单中', 'assets/' + author + '/' + packageName))
      }
    }
    for (const packageId of declaredPackages) {
      if (!packageDirs.includes(packageId)) {
        problems.push(problem('error', 'PACKAGE_DIR_MISSING', '包清单声明的 ' + packageId + ' 没有对应目录', 'assets/' + author + '/' + packageId))
      }
    }

    for (const packageId of packageDirs) {
      stats.packages += 1
      const packageDir = join(authorDir, packageId)
      const packageRel = 'assets/' + author + '/' + packageId
      const versions = readVersions(packageDir, packageRel, problems)
      const versionDirs = listDirNames(packageDir).filter((name) => name !== VERSIONS_FILE)
      if (versions) {
        for (const version of versions.versions) {
          if (!versionDirs.includes(version)) {
            problems.push(problem('error', 'VERSION_DIR_MISSING', '版本列表声明的 ' + version + ' 没有对应目录', packageRel))
          }
        }
      }
      for (const version of versionDirs) {
        if (versions && !versions.versions.includes(version)) {
          problems.push(problem('error', 'VERSION_UNDECLARED', '版本目录 ' + version + ' 未出现在 versions.json 中', packageRel))
        }
      }

      let latestTypes = null
      for (const version of versionDirs) {
        stats.versions += 1
        const result = validateVersion({
          versionDir: join(packageDir, version),
          versionRel: packageRel + '/' + version,
          packageId,
          version,
          expectedFormatVersion,
          problems,
        })
        stats.files += result.files
        if (versions && versions.latest === version) latestTypes = result.types
      }
      treeTypes.set(author + '/' + packageId, latestTypes)
    }
  }

  const indexEntries = readIndex(root, problems)
  if (indexEntries === null) {
    if (requireIndex) {
      problems.push(problem('error', 'ASSETS_INDEX_MISSING', '发布目录缺 assets.json 索引', 'assets.json'))
    }
  } else {
    stats.indexEntries = indexEntries.length
    const treeKeys = new Set(treeTypes.keys())
    const indexKeys = new Set(indexEntries.map((item) => item.key))
    for (const key of treeKeys) {
      if (!indexKeys.has(key)) {
        problems.push(problem('error', 'ASSETS_INDEX_ENTRY_MISSING', '索引漏记 ' + key, 'assets.json'))
      }
    }
    for (const entry of indexEntries) {
      if (!treeKeys.has(entry.key)) {
        problems.push(problem('error', 'ASSETS_INDEX_ENTRY_EXTRA', '索引多记了树里没有的 ' + entry.key, 'assets.json'))
        continue
      }
      const types = treeTypes.get(entry.key)
      if (types && types.length > 0) {
        const left = [...types].sort().join(',')
        const right = [...entry.types].sort().join(',')
        if (left !== right) {
          problems.push(problem('error', 'ASSETS_INDEX_TYPES_MISMATCH', '索引记录的 types 与 ' + entry.key + ' 最新版本的元数据不一致', 'assets.json'))
        }
      }
    }
  }

  return stats
}
