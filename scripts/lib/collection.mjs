/**
 * 合集常量与文件操作助手。
 *
 * 这里集中放三类东西:合集自身标识与固定路径、三层清单的约定文件名、发布目录与登记目录中共用的读写助手。
 * 其它模块只从这里取常量,不在各自文件里另写一份路径,避免改布局时漏改。
 */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

/** 合集标识,同时是本仓库名、EEC 证书主题的 CN、certs/ 下的来源文件夹名。 */
export const COLLECTION_ID = 'awesome-dsc-humanize-asset'

/** 三层清单的文件名与签名后缀。签名由 CI 用 openssl 生成,脚本只写清单、不签名。 */
export const MANIFEST_FILE = 'manifest.json'
export const MANIFEST_SIG_SUFFIX = '.sig'
export const MANIFEST_SCHEMA_VERSION = 1

/** 资产包的四类内容类型,取自 dsc-humanize-asset-template 的规范第三节,顺序固定。 */
export const CONTENT_TYPES = ['persona', 'labels', 'strategies', 'injection']

/** 包根目录除类型目录之外允许出现的条目:元数据与面向人的说明。 */
export const PACKAGE_ROOT_FILES = ['asset.json', 'README.md']

/** L1 清单覆盖的文件,相对发布目录根。 */
export const LAYER1_FILES = ['meta.json', 'assets.json', 'tags.json', 'assets/author_manifest.json']

/** 各层与各目录的固定文件名:assets/author_manifest.json 是作者清单,assets/<作者>/asset_manifest.json 是该作者的包清单。 */
export const AUTHOR_MANIFEST_FILE = 'author_manifest.json'
export const ASSET_MANIFEST_FILE = 'asset_manifest.json'
export const VERSIONS_FILE = 'versions.json'
export const CATALOG_INDEX_FILE = 'index.json'
export const CATALOG_ANOMALIES_FILE = 'anomalies.json'
export const REMOVED_FILE = 'removed.json'

/** 信任材料路径,相对仓库根。根证书是资产侧唯一信任锚,EEC 是本合集的终端签名证书。 */
export const ROOT_CA_ID = 'dsc-humanize'
export const ROOT_CA_FILE = 'dsc-humanize-root-ca.crt'
export const ROOT_CA_PUB_FILE = 'dsc-humanize-root-ca-secret.pub'
export const EEC_FILE = COLLECTION_ID + '-eec.crt'
export const EEC_PUB_FILE = COLLECTION_ID + '-secret.pub'
export const CERTS_DIR = 'certs'
export const EEC_CERT_REL = CERTS_DIR + '/' + COLLECTION_ID + '/' + EEC_FILE
export const ROOT_CA_REL = CERTS_DIR + '/' + ROOT_CA_ID + '/' + ROOT_CA_FILE

/** 是否是普通对象,不含数组与 null。 */
export function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 把 Windows 分隔符统一成正斜杠,清单与问题记录里只使用正斜杠。 */
export function toPosix(value) {
  return String(value).split(sep).join('/').split('\\').join('/')
}

/** 读取 JSON 文件;解析失败时抛出带路径的错误。 */
export function readJsonFile(path) {
  const text = readFileSync(path, 'utf8')
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(path + ' 不是合法 JSON:' + error.message)
  }
}

/** 写 JSON 文件,两空格缩进并以单换行结尾,保证同一份内容总是同一串字节。 */
export function writeJsonFile(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

/** 列出目录下的子目录名,按字典序排序;目录不存在时返回空数组。 */
export function listDirNames(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/** 列出目录下的文件名,按字典序排序;目录不存在时返回空数组。 */
export function listFileNames(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort()
}

/** 递归列出目录下全部普通文件,返回相对该目录的正斜杠路径,按字典序排序。 */
export function listFilesRecursive(dir, prefix = '') {
  if (!existsSync(dir)) return []
  const names = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? prefix + '/' + entry.name : entry.name
    if (entry.isDirectory()) names.push(...listFilesRecursive(join(dir, entry.name), rel))
    else if (entry.isFile()) names.push(rel)
  }
  return names.sort()
}

/** 计算文件内容的 SHA-512,小写十六进制。 */
export function sha512OfFile(path) {
  return createHash('sha512').update(readFileSync(path)).digest('hex')
}

/** 计算一段文本或字节的 SHA-512,小写十六进制。 */
export function sha512OfBytes(bytes) {
  return createHash('sha512').update(bytes).digest('hex')
}

/** 递归复制目录,返回复制到的文件数;目标目录按需创建。 */
export function copyTree(source, target) {
  let count = 0
  for (const rel of listFilesRecursive(source)) {
    const from = join(source, ...rel.split('/'))
    const to = join(target, ...rel.split('/'))
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
    count += 1
  }
  return count
}

/** 清空并重建一个目录。 */
export function resetDir(dir) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
}

/** 判断路径是否是普通文件。 */
export function isFile(path) {
  return existsSync(path) && statSync(path).isFile()
}

/** 判断路径是否是目录。 */
export function isDir(path) {
  return existsSync(path) && statSync(path).isDirectory()
}

/** 把绝对路径转成相对 root 的正斜杠路径,用于问题记录里定位文件。 */
export function relFrom(root, path) {
  return toPosix(relative(root, path))
}
