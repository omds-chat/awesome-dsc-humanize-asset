/**
 * 三层哈希清单的生成与校验。
 *
 * L1 发布目录根、L2 每个作者目录、L3 每个资产包目录各一份 manifest.json,层与层之间互不引用,
 * 任何一层都可以单独校验、单独重签。清单记录该层文件的 SHA-512,哈希算法全组织统一为 SHA-512。
 *
 * 本模块只生成与校验清单,不签名:清单签名由 CI 在生成清单之后用 openssl 完成,
 * 命令见 .github/pipeline.README.md。清单内容一变,旧签名立即失效,因此内容变化时本模块会删掉旧签名,
 * 让「缺签名」在下一步显式失败,而不是留下一个与内容对不上的签名。
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { problem } from './check-report.mjs'
import {
  ASSET_MANIFEST_FILE,
  LAYER1_FILES,
  MANIFEST_FILE,
  MANIFEST_SCHEMA_VERSION,
  MANIFEST_SIG_SUFFIX,
  VERSIONS_FILE,
  isObject,
  listDirNames,
  listFilesRecursive,
  readJsonFile,
  sha512OfFile,
  toPosix,
} from './collection.mjs'

/** 清单条目的哈希格式:128 位小写十六进制。 */
const SHA512_RE = /^[0-9a-f]{128}$/

/** 读取该层目录里现有的清单,只用于沿用 revision;读不到或结构不对时返回 null。 */
export function readPreviousManifest(layerDir) {
  const path = join(layerDir, MANIFEST_FILE)
  if (!existsSync(path)) return null
  try {
    const data = readJsonFile(path)
    return isObject(data) && Array.isArray(data.files) ? data : null
  } catch {
    return null
  }
}

/** 旧清单记录的路径与哈希是否与新算出的完全一致。 */
export function sameEntries(previous, entries) {
  if (!previous) return false
  if (previous.files.length !== entries.length) return false
  const recorded = new Map()
  for (const item of previous.files) {
    if (isObject(item) && typeof item.path === 'string') recorded.set(item.path, item.sha512)
  }
  return entries.every((item) => recorded.get(item.path) === item.sha512)
}

/** 读取 versions.json 的版本列表,读不到时返回空数组。 */
export function readVersionList(path) {
  if (!existsSync(path)) return []
  try {
    const data = readJsonFile(path)
    return Array.isArray(data?.versions) ? data.versions.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

/**
 * 列出三层清单各自的目录与覆盖范围。
 *
 * L1:发布目录根,覆盖 meta.json、assets.json、tags.json 与 assets/author_manifest.json;
 * L2:每个作者目录,覆盖 asset_manifest.json;
 * L3:每个包目录,覆盖 versions.json 与各版本目录下的全部包内文件。
 * catalog/ 与 certs/ 是登记信息与信任材料,不进任何清单;清单自身与其签名也不进清单。
 */
export function listLayerTargets(root) {
  const targets = [
    {
      layer: 'L1',
      layerRel: '',
      layerDir: root,
      files: LAYER1_FILES.filter((rel) => existsSync(join(root, ...rel.split('/')))),
    },
  ]
  const assetsDir = join(root, 'assets')
  for (const author of listDirNames(assetsDir)) {
    const authorDir = join(assetsDir, author)
    targets.push({ layer: 'L2', layerRel: 'assets/' + author, layerDir: authorDir, files: [ASSET_MANIFEST_FILE] })
    for (const packageName of listDirNames(authorDir)) {
      const packageDir = join(authorDir, packageName)
      const files = listFilesRecursive(packageDir).filter(
        (rel) => rel !== MANIFEST_FILE && rel !== MANIFEST_FILE + MANIFEST_SIG_SUFFIX,
      )
      targets.push({ layer: 'L3', layerRel: 'assets/' + author + '/' + packageName, layerDir: packageDir, files })
    }
  }
  return targets
}

/** 把层目录内的相对路径列表转成清单条目,按 path 字典序排列,只收实际存在的普通文件。 */
export function layerEntries(layerDir, files) {
  const entries = []
  for (const rel of files) {
    const filePath = join(layerDir, ...rel.split('/'))
    if (!existsSync(filePath)) continue
    entries.push({ path: toPosix(rel), sha512: sha512OfFile(filePath) })
  }
  entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
  return entries
}

/**
 * 写一层清单。revision 每层独立:文件集合与哈希都没变时沿用旧值,有变化时加一,没有旧清单时从 1 开始。
 * 内容变化时删除该层旧签名,避免留下与清单对不上的签名。
 */
export function writeLayerManifest({ layer, layerRel, layerDir, entries, previous, problems }) {
  const previousManifest = previous === undefined ? readPreviousManifest(layerDir) : previous
  const unchanged = sameEntries(previousManifest, entries)
  const previousRevision =
    previousManifest && Number.isInteger(previousManifest.revision) && previousManifest.revision > 0
      ? previousManifest.revision
      : null
  let revision = 1
  if (previousRevision !== null) revision = unchanged ? previousRevision : previousRevision + 1

  const manifestPath = join(layerDir, MANIFEST_FILE)
  const text = JSON.stringify({ schemaVersion: MANIFEST_SCHEMA_VERSION, revision, files: entries }, null, 2) + '\n'
  const previousText = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null
  const changed = previousText !== text
  if (changed) writeFileSync(manifestPath, text, 'utf8')

  const rel = layerRel ? layerRel + '/' + MANIFEST_FILE : MANIFEST_FILE
  const sigPath = manifestPath + MANIFEST_SIG_SUFFIX
  if (changed && existsSync(sigPath)) {
    rmSync(sigPath, { force: true })
    problems.push(problem('warning', 'MANIFEST_SIG_REMOVED', '清单内容已变化,已删除失效的 ' + rel + MANIFEST_SIG_SUFFIX + ';由 CI 用 EEC 重新签名', rel + MANIFEST_SIG_SUFFIX))
  }
  return { layer, dir: layerRel || '.', revision, files: entries.length, changed }
}

/** 生成三层清单:L1 发布目录根、L2 每个作者目录、L3 每个包目录,互不引用。 */
export function buildLayerManifests({ root, previousResolver = null, problems }) {
  const summaries = []
  for (const target of listLayerTargets(root)) {
    const entries = layerEntries(target.layerDir, target.files)
    const previous = previousResolver ? (previousResolver(target.layerRel) ?? null) : undefined
    summaries.push(writeLayerManifest({ ...target, entries, previous, problems }))
  }
  return summaries
}

/**
 * 校验清单条目里 path 的合法性:正斜杠、相对该层目录,不含空段与 . 或 .. 段,不指向清单自身。
 * 清单条目的 path 只相对清单所在目录,不带动层路径,所以这里不比对层前缀。
 */
function checkEntryPath({ path }) {
  if (typeof path !== 'string' || path.length === 0) return 'path 必须是非空字符串'
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return 'path 不得是绝对路径'
  if (path.includes('\\')) return 'path 必须用正斜杠'
  const segments = path.split('/')
  if (segments.some((segment) => segment.length === 0)) return 'path 不得含空段'
  if (segments.includes('.') || segments.includes('..')) return 'path 不得出现 . 或 .. 段'
  if (path === MANIFEST_FILE || path === MANIFEST_FILE + MANIFEST_SIG_SUFFIX) return 'path 不得指向清单自身或其签名'
  return null
}

/**
 * 校验三层清单:结构、覆盖范围、每个文件的 SHA-512、以及签名文件是否就位。
 * 只检查签名的存在与 DER 形状,CMS 验签由 CI 用 openssl 完成,脚本不实现验签。
 */
export function verifyManifests({ root, problems, allowUnsigned = false }) {
  const targets = listLayerTargets(root)
  const summaries = []
  for (const target of targets) {
    const manifestPath = join(target.layerDir, MANIFEST_FILE)
    const rel = target.layerRel ? target.layerRel + '/' + MANIFEST_FILE : MANIFEST_FILE
    if (!existsSync(manifestPath)) {
      problems.push(problem('error', 'MANIFEST_MISSING', target.layer + ' 缺清单:' + rel, rel))
      continue
    }

    let data
    try {
      data = readJsonFile(manifestPath)
    } catch (error) {
      problems.push(problem('error', 'MANIFEST_INVALID', error.message, rel))
      continue
    }
    if (!isObject(data)) {
      problems.push(problem('error', 'MANIFEST_NOT_OBJECT', '清单必须是 JSON 对象', rel))
      continue
    }
    if (data.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
      problems.push(problem('error', 'MANIFEST_SCHEMA_VERSION', 'schemaVersion 必须为 ' + MANIFEST_SCHEMA_VERSION, rel))
    }
    if (!Number.isInteger(data.revision) || data.revision < 1) {
      problems.push(problem('error', 'MANIFEST_REVISION_INVALID', 'revision 必须是正整数', rel))
    }
    if (!Array.isArray(data.files) || data.files.length === 0) {
      problems.push(problem('error', 'MANIFEST_FILES_INVALID', 'files 必须是非空数组', rel))
      continue
    }

    const listed = new Map()
    for (const [index, item] of data.files.entries()) {
      const where = rel + ' files[' + index + ']'
      if (!isObject(item)) {
        problems.push(problem('error', 'MANIFEST_ENTRY_NOT_OBJECT', '清单条目必须是 JSON 对象', where))
        continue
      }
      const extra = Object.keys(item).filter((key) => key !== 'path' && key !== 'sha512')
      if (extra.length > 0) {
        problems.push(problem('error', 'MANIFEST_ENTRY_EXTRA_FIELD', '清单条目只允许 path 与 sha512,多出 ' + extra.join(','), where))
      }
      const pathError = checkEntryPath({ path: item.path })
      if (pathError) {
        problems.push(problem('error', 'MANIFEST_PATH_INVALID', String(item.path) + ':' + pathError, where))
        continue
      }
      if (typeof item.sha512 !== 'string' || !SHA512_RE.test(item.sha512)) {
        problems.push(problem('error', 'MANIFEST_HASH_INVALID', 'sha512 必须是 128 位小写十六进制', where))
        continue
      }
      if (listed.has(item.path)) {
        problems.push(problem('error', 'MANIFEST_PATH_DUPLICATE', '清单重复记录 ' + item.path, where))
        continue
      }
      listed.set(item.path, item.sha512)
    }

    const expected = new Set(target.files.map((item) => toPosix(item)))
    for (const path of expected) {
      if (!listed.has(path)) {
        problems.push(problem('error', 'MANIFEST_PATH_MISSING', target.layer + ' 清单漏记 ' + path, rel))
      }
    }
    for (const path of listed.keys()) {
      if (!expected.has(path)) {
        problems.push(problem('error', 'MANIFEST_PATH_EXTRA', target.layer + ' 清单多记了该层没有的文件 ' + path, rel))
      }
    }
    for (const [path, digest] of listed) {
      if (!expected.has(path)) continue
      const actual = sha512OfFile(join(target.layerDir, ...path.split('/')))
      if (actual !== digest) {
        problems.push(problem('error', 'MANIFEST_HASH_MISMATCH', target.layer + ' 的 ' + path + ' 哈希与清单不一致', rel))
      }
    }

    const sigPath = manifestPath + MANIFEST_SIG_SUFFIX
    const sigRel = rel + MANIFEST_SIG_SUFFIX
    if (!existsSync(sigPath)) {
      const level = allowUnsigned ? 'warning' : 'error'
      problems.push(problem(level, 'MANIFEST_SIG_MISSING', target.layer + ' 清单缺签名:' + sigRel, sigRel))
    } else {
      const bytes = readFileSync(sigPath)
      const looksPem = bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '-----'
      if (looksPem) {
        problems.push(problem('error', 'MANIFEST_SIG_NOT_DER', '签名是 PEM 文本,不是 CMS DER;签名必须带 -outform DER', sigRel))
      } else if (bytes.length < 100) {
        problems.push(problem('error', 'MANIFEST_SIG_TRUNCATED', '签名文件过短,不可能是 CMS DER 签名', sigRel))
      } else if (bytes[0] !== 0x30) {
        problems.push(problem('error', 'MANIFEST_SIG_NOT_DER', '签名首个字节不是 0x30,CMS 签名必须是 DER 格式(-outform DER)', sigRel))
      }
    }

    summaries.push({ layer: target.layer, dir: target.layerRel || '.', revision: data.revision, files: data.files.length })
  }
  return summaries
}
