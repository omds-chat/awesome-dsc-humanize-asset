/**
 * 按登记从作者站点拉取资产包,并校验拉取结果的形状。
 *
 * 作者站点按本合集的发布约定组织,与资产包自身的格式分开:
 *   <base_url>versions.json           版本索引,含每个版本的包内文件列表(HTTP 无法列举目录)
 *   <base_url><版本>/<包内路径>        包内文件,asset.json 与四类内容目录原样,不额外加文件
 * 包本体仍是 dsc-humanize-asset-template 定义的资产包:包根只有 asset.json、已声明的类型目录与可选 README.md。
 *
 * 本模块只取字节与判形状,不签名、不改写包内容。任何一步失败都抛错,由调用方按运行期异常把该包从本次发布剔除。
 */

import { ASSET_ID_RE, SEMVER_RE, splitContentPath, validateContentFile, validateMetadata, validatePackageLayout } from './asset-package.mjs'
import { validateVersionIndex } from './versions.mjs'

/** 默认单请求超时,毫秒。 */
export const DEFAULT_TIMEOUT_MS = 20000

/** 拼一个以斜杠结尾的站点基址。 */
function normalizeBase(baseUrl) {
  return baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'
}

/** 带阶段名的错误:阶段用于异常报告,便于分清是索引坏了还是某个文件取不到。 */
function stageError(stage, message) {
  const error = new Error(message)
  error.stage = stage
  return error
}

/** 取一段字节,非 2xx 与空内容都按失败处理。按字节取是为了让写盘后的包内容与作者站点逐字节一致。 */
async function fetchBytes(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' })
  } catch (error) {
    throw stageError('fetch', '拉取失败 ' + url + ':' + (error && error.message ? error.message : String(error)))
  }
  if (!response.ok) {
    throw stageError('fetch', '拉取失败 ' + url + ':HTTP ' + response.status)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length === 0) {
    throw stageError('fetch', '拉取到空内容:' + url)
  }
  return bytes
}

/** 取一段 JSON,解析失败按失败处理并给出地址。 */
async function fetchJson(url, options) {
  const bytes = await fetchBytes(url, options)
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw stageError('fetch', '返回的不是合法 JSON ' + url + ':' + error.message)
  }
}

/**
 * 拉取一个包的全部版本与包内文件。
 * @param {object} context 上下文
 * @param {string} context.baseUrl 登记里的作者站点基址
 * @param {string} context.id 包标识
 * @param {string|null} context.expectedFormatVersion 合集接受的格式版本
 * @param {number} [context.timeoutMs] 单请求超时
 * @returns {Promise<{latest: string, versions: string[], packages: Map<string, Map<string, Buffer>>, types: Map<string, string[]>}>}
 */
export async function pullPackage({ baseUrl, id, expectedFormatVersion = null, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (typeof id !== 'string' || !ASSET_ID_RE.test(id)) {
    throw stageError('catalog', '包标识不合法:' + JSON.stringify(id))
  }
  const base = normalizeBase(baseUrl)
  const indexUrl = base + 'versions.json'
  const problems = []
  const indexData = await fetchJson(indexUrl, { timeoutMs })
  const index = validateVersionIndex(indexData, { where: indexUrl, problems, allowFiles: true })
  if (problems.some((item) => item.level === 'error') || !index) {
    throw stageError('versions', '版本索引不合规 ' + indexUrl + ':' + describeProblems(problems))
  }

  const packages = new Map()
  const types = new Map()
  const versions = [...index.versions]

  for (const version of versions) {
    if (!SEMVER_RE.test(version)) throw stageError('versions', '版本号不合法:' + JSON.stringify(version))
    const files = index.files[version]
    const contents = new Map()
    for (const rel of files) {
      const url = base + version + '/' + rel
      contents.set(rel, await fetchBytes(url, { timeoutMs }))
    }

    const local = []
    let metadata = null
    const assetBytes = contents.get('asset.json')
    if (assetBytes === undefined) {
      local.push({ level: 'error', code: 'METADATA_FILE_MISSING', message: '包内缺 asset.json', path: version + '/asset.json' })
    } else {
      let data = null
      try {
        data = JSON.parse(assetBytes.toString('utf8'))
      } catch (error) {
        local.push({ level: 'error', code: 'METADATA_FILE_INVALID', message: version + '/asset.json 不是合法 JSON:' + error.message, path: version + '/asset.json' })
      }
      if (data !== null) {
        metadata = validateMetadata(data, {
          expectedId: id,
          expectedFormatVersion,
          where: version + '/asset.json',
          problems: local,
        })
        if (metadata && metadata.version !== version) {
          local.push({
            level: 'error',
            code: 'METADATA_VERSION_MISMATCH',
            message: '元数据 version 为 ' + metadata.version + ',与站点上的版本目录 ' + version + ' 不一致',
            path: version + '/asset.json',
          })
        }
      }
    }

    const discovered = new Set()
    for (const rel of files) {
      const split = splitContentPath(rel)
      if (split) discovered.add(split.type)
    }
    const layout = validatePackageLayout({
      files,
      types: metadata ? metadata.types : [...discovered],
      where: version,
      problems: local,
    })

    const seenIds = new Map()
    for (const item of layout.contents) {
      const bytes = contents.get(item.path)
      if (bytes === undefined) continue
      let data
      try {
        data = JSON.parse(bytes.toString('utf8'))
      } catch (error) {
        local.push({ level: 'error', code: 'CONTENT_FILE_INVALID', message: version + '/' + item.path + ' 不是合法 JSON:' + error.message, path: version + '/' + item.path })
        continue
      }
      const contentId = validateContentFile(data, { where: version + '/' + item.path, problems: local })
      if (!contentId) continue
      const key = item.type + '/' + contentId
      if (seenIds.has(key)) {
        local.push({
          level: 'error',
          code: 'CONTENT_ID_DUPLICATE',
          message: '同一类型内内容标识重复:' + contentId,
          path: version + '/' + item.path,
        })
        continue
      }
      seenIds.set(key, item.path)
    }

    if (local.some((item) => item.level === 'error')) {
      throw stageError('package', describeProblems(local))
    }

    packages.set(version, contents)
    types.set(version, metadata ? metadata.types : [...discovered].sort())
  }

  return { latest: index.latest, versions, packages, types }
}

/** 把问题列表压成一句话,最多列五条,避免异常报告过长。 */
function describeProblems(problems) {
  const errors = problems.filter((item) => item.level === 'error')
  const head = errors.slice(0, 5).map((item) => item.code + ' ' + item.message + (item.path ? '(' + item.path + ')' : ''))
  const rest = errors.length > head.length ? ';另有 ' + (errors.length - head.length) + ' 条' : ''
  return head.join(';') + rest
}
