/**
 * 版本索引的形状:作者站点上的 versions.json 与发布目录里各包的 versions.json 共用同一份判定。
 *
 * 两处的唯一差别是 files 字段:作者站点用它列出每个版本的包内文件(HTTP 无法列举目录),
 * 发布目录里不需要它,文件由 L3 清单登记。除此之外的字段与取值规则完全一致。
 */

import { problem } from './check-report.mjs'
import { SEMVER_RE } from './asset-package.mjs'
import { isObject } from './collection.mjs'

/**
 * 校验版本索引。
 * @param {unknown} data 解析后的 JSON
 * @param {object} context 上下文
 * @param {string} context.where 问题定位用的路径
 * @param {Array<object>} context.problems 问题收集数组
 * @param {boolean} [context.allowFiles] 是否允许并校验 files 字段
 * @returns {{latest: string|null, versions: string[], files: Record<string, string[]>}|null}
 */
export function validateVersionIndex(data, { where, problems, allowFiles = true }) {
  if (!isObject(data)) {
    problems.push(problem('error', 'VERSIONS_NOT_OBJECT', '版本索引必须是 JSON 对象', where))
    return null
  }
  const allowed = allowFiles ? ['latest', 'versions', 'files'] : ['latest', 'versions']
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) {
      problems.push(problem('error', 'VERSIONS_EXTRA_FIELD', '版本索引只允许 ' + allowed.join('、') + ',多出 ' + key, where))
    }
  }

  const versions = []
  if (!Array.isArray(data.versions) || data.versions.length === 0) {
    problems.push(problem('error', 'VERSIONS_LIST_INVALID', 'versions 必须是非空数组', where))
  } else {
    for (const item of data.versions) {
      if (typeof item !== 'string' || !SEMVER_RE.test(item)) {
        problems.push(problem('error', 'VERSIONS_ENTRY_INVALID', '版本号必须是三段数字,当前为 ' + JSON.stringify(item), where))
        continue
      }
      if (versions.includes(item)) {
        problems.push(problem('error', 'VERSIONS_ENTRY_DUPLICATE', '版本列表重复出现 ' + item, where))
        continue
      }
      versions.push(item)
    }
  }

  const latest = typeof data.latest === 'string' ? data.latest : null
  if (latest === null || !SEMVER_RE.test(latest)) {
    problems.push(problem('error', 'VERSIONS_LATEST_INVALID', 'latest 必须是三段数字', where))
  } else if (!versions.includes(latest)) {
    problems.push(problem('error', 'VERSIONS_LATEST_NOT_LISTED', 'latest 为 ' + latest + ',但不在 versions 列表内', where))
  }

  const files = {}
  if (allowFiles) {
    if (!isObject(data.files)) {
      problems.push(problem('error', 'VERSIONS_FILES_INVALID', 'files 必须是对象,键为版本号,值为该版本的包内文件列表', where))
      return versions.length > 0 ? { latest, versions, files } : null
    }
    const keys = Object.keys(data.files)
    for (const version of versions) {
      if (!keys.includes(version)) {
        problems.push(problem('error', 'VERSIONS_FILES_MISSING', 'files 缺版本 ' + version + ' 的文件列表', where))
      }
    }
    for (const key of keys) {
      if (!versions.includes(key)) {
        problems.push(problem('error', 'VERSIONS_FILES_EXTRA', 'files 出现 versions 列表之外的版本 ' + key, where))
        continue
      }
      const list = data.files[key]
      if (!Array.isArray(list) || list.length === 0) {
        problems.push(problem('error', 'VERSIONS_FILES_ENTRY_INVALID', 'files.' + key + ' 必须是非空字符串数组', where))
        continue
      }
      const seen = new Set()
      const paths = []
      for (const item of list) {
        if (typeof item !== 'string' || item.length === 0) {
          problems.push(problem('error', 'VERSIONS_FILES_ENTRY_INVALID', 'files.' + key + ' 的元素必须是非空字符串', where))
          continue
        }
        if (seen.has(item)) {
          problems.push(problem('error', 'VERSIONS_FILES_ENTRY_DUPLICATE', 'files.' + key + ' 重复列出 ' + item, where))
          continue
        }
        seen.add(item)
        paths.push(item)
      }
      files[key] = paths
    }
  }

  return { latest, versions, files }
}
