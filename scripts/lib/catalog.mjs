/**
 * 收录登记的读取与校验。
 *
 * catalog/ 是本合集唯一的收录入口,只登记三件事:谁(作者)、在哪个站点发布(base_url)、发布哪个包(包标识)。
 * 包的名称、说明、许可证、版本与内容类型都不在这里登记,它们来自作者站点上的包元数据,避免同一事实两处维护。
 * 目录名即身份:<作者> 目录名就是 username,<包标识> 目录名就是 asset.json 的 id。
 */

import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { ASSET_ID_RE } from './asset-package.mjs'
import { problem } from './check-report.mjs'
import { REMOVED_FILE, isObject, listDirNames, listFileNames, readJsonFile } from './collection.mjs'

/** GitHub 用户名规则,字母不区分大小写。 */
export const AUTHOR_NAME_RE = /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/

/** 作者站点基址:http 或 https 绝对地址,以斜杠结尾,不带查询串与锚点。 */
export const BASE_URL_RE = /^https?:\/\/[^/\s?#]+(?:\/[^?\s#]*)?\/$/

/** author.json 允许出现的全部字段。 */
export const AUTHOR_FIELDS = ['username', 'profile']

/** package.json 允许出现的全部字段。 */
export const PACKAGE_FIELDS = ['id', 'base_url', 'repo_link', 'tags']

/** removed.json 允许出现的全部字段。 */
export const REMOVED_FIELDS = ['id', 'author', 'base_url', 'removed_in', 'note']

/**
 * 读取预设标签词表,必须是元素非空、互不重复的字符串数组。
 * 文件缺失时按空清单处理并记错误:没有词表就无从判断标签取值。
 */
export function readPresetTags(tagsPath, problems) {
  if (!existsSync(tagsPath)) {
    problems.push(problem('error', 'TAGS_FILE_MISSING', '预设标签词表不存在:' + tagsPath, 'tags.json'))
    return []
  }
  const data = readJsonFile(tagsPath)
  if (!Array.isArray(data)) {
    problems.push(problem('error', 'TAGS_NOT_ARRAY', '预设标签词表的顶层必须是字符串数组', 'tags.json'))
    return []
  }
  const seen = new Set()
  const tags = []
  for (const tag of data) {
    if (typeof tag !== 'string' || tag.trim().length === 0) {
      problems.push(problem('error', 'TAGS_INVALID_ENTRY', '预设标签词表含非字符串或空标签', 'tags.json'))
      continue
    }
    if (seen.has(tag)) {
      problems.push(problem('error', 'TAGS_DUPLICATE', '预设标签词表重复出现 ' + tag, 'tags.json'))
      continue
    }
    seen.add(tag)
    tags.push(tag)
  }
  return tags
}

/**
 * 读取并校验 catalog/ 的登记。
 * @param {object} context 上下文
 * @param {string} context.catalogDir catalog 目录
 * @param {Array<object>} context.problems 问题收集数组
 * @returns {{authors: Array<object>, packages: Array<object>}}
 */
export function readCatalog({ catalogDir, problems }) {
  if (!existsSync(catalogDir)) throw new Error('catalog 目录不存在:' + catalogDir)

  const authors = []
  const packages = []
  const seenNames = new Map()
  const seenIds = new Map()

  for (const name of listFileNames(catalogDir)) {
    if (name === 'README.md' || name === REMOVED_FILE) continue
    problems.push(problem('warning', 'CATALOG_STRAY_FILE', 'catalog/ 根目录只应有 README.md、removed.json 与作者目录,发现文件 ' + name, 'catalog/' + name))
  }

  for (const authorName of listDirNames(catalogDir)) {
    const authorDir = join(catalogDir, authorName)
    const authorRel = 'catalog/' + authorName
    const authorFile = join(authorDir, 'author.json')
    if (!existsSync(authorFile)) {
      problems.push(problem('error', 'AUTHOR_FILE_MISSING', '作者目录缺 author.json', authorRel))
      continue
    }

    let authorData
    try {
      authorData = readJsonFile(authorFile)
    } catch (error) {
      problems.push(problem('error', 'AUTHOR_FILE_INVALID', error.message, authorRel + '/author.json'))
      continue
    }
    if (!isObject(authorData)) {
      problems.push(problem('error', 'AUTHOR_NOT_OBJECT', 'author.json 必须是 JSON 对象', authorRel + '/author.json'))
      continue
    }
    for (const key of Object.keys(authorData)) {
      if (!AUTHOR_FIELDS.includes(key)) {
        problems.push(problem('error', 'AUTHOR_UNKNOWN_FIELD', 'author.json 出现规定之外的字段 ' + key, authorRel + '/author.json'))
      }
    }
    const username = authorData.username
    const profile = authorData.profile
    if (typeof username !== 'string' || !AUTHOR_NAME_RE.test(username)) {
      problems.push(
        problem('error', 'AUTHOR_NAME_INVALID', 'username 必须符合 GitHub 用户名规则:字母、数字与连字符,首尾不得是连字符,长度 1 到 39', authorRel + '/author.json'),
      )
    } else if (username !== authorName) {
      problems.push(problem('error', 'AUTHOR_NAME_MISMATCH', 'username 为 ' + username + ',与目录名 ' + authorName + ' 不一致', authorRel + '/author.json'))
    }
    if (typeof profile !== 'string' || profile.trim().length === 0) {
      problems.push(problem('error', 'AUTHOR_PROFILE_INVALID', 'profile 必须是非空的作者主页绝对地址', authorRel + '/author.json'))
    }

    const lower = authorName.toLowerCase()
    if (seenNames.has(lower)) {
      problems.push(
        problem('error', 'AUTHOR_NAME_COLLISION', '作者目录 ' + seenNames.get(lower) + ' 与 ' + authorName + ' 仅大小写不同,属同一个作者', authorRel),
      )
    } else {
      seenNames.set(lower, authorName)
    }

    for (const name of listFileNames(authorDir)) {
      if (name === 'author.json') continue
      problems.push(problem('warning', 'AUTHOR_STRAY_FILE', '作者目录只应有 author.json 与包目录,发现文件 ' + name, authorRel + '/' + name))
    }

    const authorPackages = []
    for (const packageName of listDirNames(authorDir)) {
      const packageDir = join(authorDir, packageName)
      const packageRel = authorRel + '/' + packageName
      const packageFile = join(packageDir, 'package.json')
      if (!existsSync(packageFile)) {
        problems.push(problem('error', 'PACKAGE_FILE_MISSING', '包目录缺 package.json', packageRel))
        continue
      }

      let packageData
      try {
        packageData = readJsonFile(packageFile)
      } catch (error) {
        problems.push(problem('error', 'PACKAGE_FILE_INVALID', error.message, packageRel + '/package.json'))
        continue
      }
      if (!isObject(packageData)) {
        problems.push(problem('error', 'PACKAGE_NOT_OBJECT', 'package.json 必须是 JSON 对象', packageRel + '/package.json'))
        continue
      }
      for (const key of Object.keys(packageData)) {
        if (!PACKAGE_FIELDS.includes(key)) {
          problems.push(problem('error', 'PACKAGE_UNKNOWN_FIELD', 'package.json 出现规定之外的字段 ' + key, packageRel + '/package.json'))
        }
      }

      const id = packageData.id
      const baseUrl = packageData.base_url
      const repoLink = packageData.repo_link
      if (typeof id !== 'string' || !ASSET_ID_RE.test(id)) {
        problems.push(
          problem('error', 'PACKAGE_ID_INVALID', 'id 必须小写字母开头、只含小写字母数字与连字符、长度 3 到 64', packageRel + '/package.json'),
        )
      } else if (id !== packageName) {
        problems.push(problem('error', 'PACKAGE_ID_MISMATCH', 'id 为 ' + id + ',与目录名 ' + packageName + ' 不一致', packageRel + '/package.json'))
      }
      if (typeof baseUrl !== 'string' || !BASE_URL_RE.test(baseUrl)) {
        problems.push(
          problem('error', 'PACKAGE_BASE_URL_INVALID', 'base_url 必须是 http 或 https 开头、以斜杠结尾、不带查询串与锚点的绝对地址', packageRel + '/package.json'),
        )
      }
      if (typeof repoLink !== 'string' || repoLink.trim().length === 0) {
        problems.push(problem('error', 'PACKAGE_REPO_LINK_INVALID', 'repo_link 必须是非空的绝对地址', packageRel + '/package.json'))
      }

      const tags = []
      if ('tags' in packageData) {
        if (!Array.isArray(packageData.tags)) {
          problems.push(problem('error', 'PACKAGE_TAGS_INVALID', 'tags 出现时必须是字符串数组', packageRel + '/package.json'))
        } else {
          const seen = new Set()
          for (const tag of packageData.tags) {
            if (typeof tag !== 'string' || tag.trim().length === 0) {
              problems.push(problem('error', 'PACKAGE_TAGS_INVALID', 'tags 的元素必须是非空字符串', packageRel + '/package.json'))
              continue
            }
            if (seen.has(tag)) {
              problems.push(problem('error', 'PACKAGE_TAGS_DUPLICATE', 'tags 重复出现 ' + tag, packageRel + '/package.json'))
              continue
            }
            seen.add(tag)
            tags.push(tag)
          }
        }
      }

      for (const name of listFileNames(packageDir)) {
        if (name === 'package.json') continue
        problems.push(
          problem('warning', 'PACKAGE_STRAY_FILE', '包目录只应有 package.json,版本与包内容不进 catalog,发现文件 ' + name, packageRel + '/' + name),
        )
      }
      if (listDirNames(packageDir).length > 0) {
        problems.push(problem('warning', 'PACKAGE_STRAY_DIR', '包目录不应有子目录:版本不进 catalog,由 CI 从 base_url 发现', packageRel))
      }

      if (typeof id === 'string' && ASSET_ID_RE.test(id)) {
        if (seenIds.has(id)) {
          problems.push(problem('error', 'PACKAGE_ID_COLLISION', '包标识 ' + id + ' 与 ' + seenIds.get(id) + ' 重复,同一合集内唯一', packageRel))
        } else {
          seenIds.set(id, packageRel)
        }
      }

      const entry = { author: authorName, id: packageName, dirName: packageName, tags, baseUrl, repoLink, packageRel }
      authorPackages.push(entry)
      packages.push(entry)
    }

    if (authorPackages.length === 0) {
      problems.push(problem('warning', 'AUTHOR_NO_PACKAGE', '作者目录下没有任何包登记', authorRel))
    }
    authors.push({ username: authorName, profile: typeof profile === 'string' ? profile : '', packages: authorPackages, authorRel })
  }

  return { authors, packages }
}

/**
 * 校验每个包的标签都取自预设词表。
 * 越界标签属于登记错误:构建中止并指出是哪个包、哪个标签,不静默丢弃。
 */
export function checkPresetTags(packages, presetTags, problems) {
  const allowed = new Set(presetTags)
  for (const item of packages) {
    for (const tag of item.tags) {
      if (!allowed.has(tag)) {
        problems.push(
          problem('error', 'PACKAGE_TAG_UNKNOWN', '包 ' + item.id + '(作者 ' + item.author + ')的标签 ' + JSON.stringify(tag) + ' 不在预设词表内', item.packageRel + '/package.json'),
        )
      }
    }
  }
}

/**
 * 读取并校验 removed.json,同时检查「已下架却仍有登记」的矛盾。
 * @returns {number} 记录条数
 */
export function checkRemoved({ catalogDir, packages, problems }) {
  const path = join(catalogDir, REMOVED_FILE)
  if (!existsSync(path)) {
    problems.push(problem('error', 'REMOVED_FILE_MISSING', 'catalog/removed.json 不存在,没有记录时保持空数组', 'catalog/' + REMOVED_FILE))
    return 0
  }
  let data
  try {
    data = readJsonFile(path)
  } catch (error) {
    problems.push(problem('error', 'REMOVED_FILE_INVALID', error.message, 'catalog/' + REMOVED_FILE))
    return 0
  }
  if (!Array.isArray(data)) {
    problems.push(problem('error', 'REMOVED_NOT_ARRAY', 'removed.json 的顶层必须是数组', 'catalog/' + REMOVED_FILE))
    return 0
  }

  const registered = new Set(packages.map((item) => item.author + '/' + item.id))
  const seen = new Set()
  let count = 0
  for (const [index, item] of data.entries()) {
    const where = 'catalog/' + REMOVED_FILE + '[' + index + ']'
    if (!isObject(item)) {
      problems.push(problem('error', 'REMOVED_ENTRY_NOT_OBJECT', '每条记录必须是 JSON 对象', where))
      continue
    }
    for (const key of Object.keys(item)) {
      if (!REMOVED_FIELDS.includes(key)) {
        problems.push(problem('error', 'REMOVED_UNKNOWN_FIELD', '记录出现规定之外的字段 ' + key, where))
      }
    }
    for (const key of ['id', 'author', 'base_url', 'removed_in']) {
      if (typeof item[key] !== 'string' || item[key].trim().length === 0) {
        problems.push(problem('error', 'REMOVED_FIELD_INVALID', '记录的 ' + key + ' 必须是非空字符串', where))
      }
    }
    if (typeof item.id === 'string' && !ASSET_ID_RE.test(item.id)) {
      problems.push(problem('error', 'REMOVED_ID_INVALID', 'id 不符合包标识格式', where))
    }
    if ('note' in item && (typeof item.note !== 'string' || item.note.trim().length === 0)) {
      problems.push(problem('error', 'REMOVED_NOTE_INVALID', 'note 出现时必须是非空字符串', where))
    }
    const key = String(item.author) + '/' + String(item.id)
    if (seen.has(key)) {
      problems.push(problem('error', 'REMOVED_DUPLICATE', '同一条记录重复出现:' + key, where))
    }
    seen.add(key)
    if (registered.has(key)) {
      problems.push(problem('error', 'REMOVED_STILL_REGISTERED', '包 ' + key + ' 已登记下架,但 catalog/ 里仍有登记', where))
    }
    count += 1
  }
  return count
}
