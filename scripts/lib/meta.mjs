/**
 * 合集元数据的形状。
 *
 * site/meta.json 是发布目录 meta.json 的唯一来源,只声明两件事:本合集按哪个规范版本判定资产包,
 * 以及接受哪个包格式版本。两个版本都对齐 dsc-humanize-asset-template 的 specs/spec-version.json,
 * 上游升版时改这里并同步 lib/asset-package.mjs 的字段约束,不做静默兼容。
 */

import { existsSync } from 'node:fs'
import { SEMVER_RE } from './asset-package.mjs'
import { problem } from './check-report.mjs'
import { isObject, readJsonFile } from './collection.mjs'

/** 合集元数据允许出现的全部字段。 */
export const META_FIELDS = ['assetSpecVersion', 'assetFormatVersion']

/**
 * 读取并校验合集元数据。
 * @param {string} path 元数据文件路径
 * @param {Array<object>} problems 问题收集数组
 * @returns {{assetSpecVersion: string|null, assetFormatVersion: string|null}|null}
 */
export function readCollectionMeta(path, problems) {
  const where = 'meta.json'
  if (!existsSync(path)) {
    problems.push(problem('error', 'META_FILE_MISSING', '合集元数据不存在:' + path, where))
    return null
  }
  let data
  try {
    data = readJsonFile(path)
  } catch (error) {
    problems.push(problem('error', 'META_FILE_INVALID', error.message, where))
    return null
  }
  if (!isObject(data)) {
    problems.push(problem('error', 'META_NOT_OBJECT', '合集元数据必须是 JSON 对象', where))
    return null
  }
  for (const key of Object.keys(data)) {
    if (!META_FIELDS.includes(key)) {
      problems.push(problem('error', 'META_UNKNOWN_FIELD', '合集元数据出现规定之外的字段 ' + key, where))
    }
  }
  const result = { assetSpecVersion: null, assetFormatVersion: null }
  for (const key of META_FIELDS) {
    const value = data[key]
    if (typeof value !== 'string' || !SEMVER_RE.test(value)) {
      problems.push(problem('error', 'META_VERSION_INVALID', key + ' 必须是三段数字,当前为 ' + JSON.stringify(value), where))
      continue
    }
    result[key] = value
  }
  return result
}
