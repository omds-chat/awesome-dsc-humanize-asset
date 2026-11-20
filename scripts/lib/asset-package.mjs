/**
 * 资产包的形状判定。
 *
 * 判定口径来自 dsc-humanize-asset-template 的 specs/asset-package-spec.md,但本模块只做合集侧需要的那部分:
 * 元数据字段集合与取值格式、包根条目、类型声明与类型目录双向一致、内容文件的标识格式。
 * 字段级语义校验(关键词、权重、策略数值边界、标签引用)不在本模块复制,那由模板仓库的校验脚本负责,
 * 本仓库只按 spec_version 引用规范,不另存一份规则。
 */

import { CONTENT_TYPES, PACKAGE_ROOT_FILES, isObject } from './collection.mjs'
import { problem } from './check-report.mjs'

/** 三段数字版本号,不允许前导零。 */
export const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

/** 包标识:小写字母开头,只含小写字母、数字与连字符,长度 3 到 64。 */
export const ASSET_ID_RE = /^[a-z][a-z0-9-]{2,63}$/

/** 内容标识:小写字母开头,只含小写字母、数字与连字符,长度 2 到 64。 */
export const CONTENT_ID_RE = /^[a-z][a-z0-9-]{1,63}$/

/** 元数据允许出现的全部字段,多一个都算格式错误。 */
export const METADATA_FIELDS = ['formatVersion', 'id', 'name', 'version', 'description', 'author', 'license', 'types']

/** 元数据的必填字段。 */
export const METADATA_REQUIRED_FIELDS = ['formatVersion', 'id', 'name', 'version', 'description', 'author', 'types']

/** 判断是否四类内容之一。 */
export function isContentType(value) {
  return CONTENT_TYPES.includes(value)
}

/**
 * 把包内相对路径拆成类型与文件名。
 * 只接受「<类型>/<文件名>.json」两层,其余返回 null。
 */
export function splitContentPath(relPath) {
  const segments = String(relPath).split('/')
  if (segments.length !== 2) return null
  if (!isContentType(segments[0])) return null
  if (!segments[1].endsWith('.json')) return null
  if (segments[1].length <= '.json'.length) return null
  return { type: segments[0], file: segments[1] }
}

/**
 * 校验包元数据(asset.json)。
 * @param {unknown} data 解析后的 JSON
 * @param {object} context 上下文
 * @param {string|null} context.expectedId 期望的包标识,通常取登记目录名
 * @param {string|null} context.expectedFormatVersion 合集接受的格式版本,取自 site/meta.json
 * @param {string} context.where 问题定位用的相对路径
 * @param {Array<object>} context.problems 问题收集数组
 * @returns {{id: string, version: string, types: string[]}|null} 关键字段,读不到时返回 null
 */
export function validateMetadata(data, { expectedId = null, expectedFormatVersion = null, where, problems }) {
  if (!isObject(data)) {
    problems.push(problem('error', 'METADATA_NOT_OBJECT', '包元数据必须是 JSON 对象', where))
    return null
  }
  for (const key of Object.keys(data)) {
    if (!METADATA_FIELDS.includes(key)) {
      problems.push(problem('error', 'METADATA_UNKNOWN_FIELD', '包元数据出现规范之外的字段 ' + key + ',元数据字段是封闭的', where))
    }
  }
  for (const key of METADATA_REQUIRED_FIELDS) {
    if (!(key in data)) {
      problems.push(problem('error', 'METADATA_FIELD_MISSING', '包元数据缺必填字段 ' + key, where))
    }
  }

  const formatVersion = data.formatVersion
  if (formatVersion !== undefined) {
    if (typeof formatVersion !== 'string' || !SEMVER_RE.test(formatVersion)) {
      problems.push(problem('error', 'METADATA_FORMAT_VERSION_INVALID', 'formatVersion 必须是三段数字,当前为 ' + JSON.stringify(formatVersion), where))
    } else if (expectedFormatVersion && formatVersion !== expectedFormatVersion) {
      problems.push(
        problem(
          'error',
          'METADATA_FORMAT_VERSION_MISMATCH',
          'formatVersion 为 ' + formatVersion + ',本合集只接受 ' + expectedFormatVersion,
          where,
        ),
      )
    }
  }

  const id = data.id
  if (id !== undefined) {
    if (typeof id !== 'string' || !ASSET_ID_RE.test(id)) {
      problems.push(problem('error', 'METADATA_ID_INVALID', 'id 必须小写字母开头、只含小写字母数字与连字符、长度 3 到 64,当前为 ' + JSON.stringify(id), where))
    } else if (expectedId && id !== expectedId) {
      problems.push(problem('error', 'METADATA_ID_MISMATCH', 'id 为 ' + id + ',与所在目录名 ' + expectedId + ' 不一致', where))
    }
  }

  const version = data.version
  if (version !== undefined && (typeof version !== 'string' || !SEMVER_RE.test(version))) {
    problems.push(problem('error', 'METADATA_VERSION_INVALID', 'version 必须是三段数字,当前为 ' + JSON.stringify(version), where))
  }

  for (const key of ['name', 'description', 'author']) {
    const value = data[key]
    if (value !== undefined && (typeof value !== 'string' || value.trim().length === 0)) {
      problems.push(problem('error', 'METADATA_TEXT_EMPTY', key + ' 必须是非空文本', where))
    }
  }

  if ('license' in data && (typeof data.license !== 'string' || data.license.trim().length === 0)) {
    problems.push(problem('error', 'METADATA_LICENSE_INVALID', 'license 出现时必须是非空文本', where))
  }

  let types = []
  if (data.types !== undefined) {
    if (!Array.isArray(data.types) || data.types.length === 0) {
      problems.push(problem('error', 'METADATA_TYPES_INVALID', 'types 必须是非空数组', where))
    } else {
      const seen = new Set()
      for (const item of data.types) {
        if (!isContentType(item)) {
          problems.push(problem('error', 'METADATA_TYPE_UNKNOWN', 'types 出现四类之外的取值 ' + JSON.stringify(item) + ',类型集合固定', where))
          continue
        }
        if (seen.has(item)) {
          problems.push(problem('error', 'METADATA_TYPE_DUPLICATE', 'types 内重复出现 ' + item, where))
          continue
        }
        seen.add(item)
        types.push(item)
      }
    }
  }

  if (typeof id !== 'string' || typeof version !== 'string' || types.length === 0) return null
  return { id, version, types }
}

/**
 * 校验包内文件列表与类型声明是否双向一致。
 *
 * 包根只允许 asset.json、可选 README.md 与已声明的类型目录;类型目录扁平,一项内容一个 JSON 文件。
 * 声明了某一类却没有文件、有文件却没声明,都在这里判错。
 * @param {object} context 上下文
 * @param {string[]} context.files 包内相对路径列表,正斜杠分隔
 * @param {string[]} context.types 元数据声明的类型
 * @param {string} context.where 问题定位用的前缀
 * @param {Array<object>} context.problems 问题收集数组
 * @returns {{contents: Array<{type: string, path: string}>, types: string[]}} 内容文件与出现的类型
 */
export function validatePackageLayout({ files, types, where, problems }) {
  const seen = new Set()
  const contents = []
  const dirs = new Set()

  for (const rel of files) {
    const path = String(rel)
    if (seen.has(path)) {
      problems.push(problem('error', 'PACKAGE_PATH_DUPLICATE', '包内文件重复登记:' + path, where))
      continue
    }
    if (path.startsWith('/') || path.includes('\\') || /^[A-Za-z]:/.test(path)) {
      problems.push(problem('error', 'PACKAGE_PATH_ABSOLUTE', '包内路径必须是相对路径、用正斜杠:' + path, where))
      continue
    }
    const segments = path.split('/')
    if (segments.some((segment) => segment.length === 0 || segment === '.')) {
      problems.push(problem('error', 'PACKAGE_PATH_INVALID', '包内路径含空段或 . 段:' + path, where))
      continue
    }
    if (segments.includes('..')) {
      problems.push(problem('error', 'PACKAGE_PATH_ESCAPE', '包内路径不得出现 .. 段:' + path, where))
      continue
    }
    seen.add(path)
    if (PACKAGE_ROOT_FILES.includes(path)) continue
    const split = splitContentPath(path)
    if (!split) {
      problems.push(
        problem('error', 'PACKAGE_PATH_UNEXPECTED', '包根只允许 asset.json、可选 README.md 与已声明的类型目录,出现 ' + path, where),
      )
      continue
    }
    dirs.add(split.type)
    contents.push({ type: split.type, path })
  }

  if (!seen.has('asset.json')) {
    problems.push(problem('error', 'PACKAGE_METADATA_MISSING', '包内缺少 asset.json', where))
  }
  for (const type of types) {
    if (!dirs.has(type)) {
      problems.push(problem('error', 'PACKAGE_TYPE_EMPTY', 'types 声明了 ' + type + ',但包里没有该类内容', where))
    }
  }
  for (const type of dirs) {
    if (!types.includes(type)) {
      problems.push(problem('error', 'PACKAGE_TYPE_UNDECLARED', '包里出现 ' + type + '/ 内容,但 types 未声明该类', where))
    }
  }
  contents.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
  return { contents, types: [...dirs].sort() }
}

/**
 * 校验一个内容文件的形状:必须是对象,且含合法内容标识。
 * 字段级的语义校验由模板仓库的校验脚本负责,这里不复制。
 * @param {unknown} data 解析后的 JSON
 * @param {object} context 上下文
 * @param {string} context.where 问题定位用的相对路径
 * @param {Array<object>} context.problems 问题收集数组
 * @returns {string|null} 内容标识
 */
export function validateContentFile(data, { where, problems }) {
  if (!isObject(data)) {
    problems.push(problem('error', 'CONTENT_NOT_OBJECT', '内容文件必须是 JSON 对象', where))
    return null
  }
  if (typeof data.id !== 'string' || !CONTENT_ID_RE.test(data.id)) {
    problems.push(
      problem('error', 'CONTENT_ID_INVALID', '内容标识必须小写字母开头、只含小写字母数字与连字符、长度 2 到 64,当前为 ' + JSON.stringify(data.id), where),
    )
    return null
  }
  return data.id
}
