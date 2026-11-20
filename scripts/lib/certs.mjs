/**
 * 信任材料检查。
 *
 * certs/ 只放公开材料,一个来源一个文件夹:certs/dsc-humanize/ 是资产侧唯一信任锚,
 * certs/awesome-dsc-humanize-asset/ 是本合集的终端签名证书(EEC)与配对公钥。
 * 本模块只读证书、只用 Node 内置的 crypto.X509Certificate 解析与验链,不生成、不签发、不替换任何证书,
 * 也不实现 CMS 签名或验签:那两步由 CI 的 openssl 命令完成。
 *
 * keyUsage 等扩展不在此判定:Node 的 X509Certificate 不暴露 Key Usage 扩展,该项由 CI 的 openssl 步骤检查。
 */

import { X509Certificate, createPublicKey } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { problem } from './check-report.mjs'
import {
  COLLECTION_ID,
  EEC_FILE,
  EEC_PUB_FILE,
  ROOT_CA_FILE,
  ROOT_CA_ID,
  ROOT_CA_PUB_FILE,
  isDir,
  listDirNames,
  listFileNames,
} from './collection.mjs'

/** 解析 PEM 证书,失败时返回 null。 */
function readCertificate(path) {
  try {
    return new X509Certificate(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/** 读取 PEM 公钥,失败时返回 null。 */
function readPublicKey(path) {
  try {
    return createPublicKey(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/** 判断当前时间是否落在证书有效期内。 */
function checkValidity(certificate, { label, where, problems }) {
  const now = Date.now()
  if (now < certificate.validFromDate.getTime()) {
    problems.push(problem('error', 'CERT_NOT_YET_VALID', label + ' 尚未生效', where))
  } else if (now > certificate.validToDate.getTime()) {
    problems.push(problem('error', 'CERT_EXPIRED', label + ' 已过期,证书只能由资产根 CA 重新签发', where))
  }
}

/** 比较证书公钥与给定公钥文件是否是同一把钥匙。 */
function checkPublicKeyMatch(certificate, { pubPath, label, where, problems }) {
  if (!existsSync(pubPath)) return false
  const publicKey = readPublicKey(pubPath)
  if (!publicKey) {
    problems.push(problem('error', 'CERT_PUBKEY_UNREADABLE', label + ' 的配对公钥无法解析:' + pubPath, where))
    return false
  }
  const fromCert = certificate.publicKey.export({ type: 'spki', format: 'der' })
  const fromFile = publicKey.export({ type: 'spki', format: 'der' })
  if (!fromCert.equals(fromFile)) {
    problems.push(problem('error', 'CERT_PUBKEY_MISMATCH', label + ' 的配对公钥与证书里的公钥不是同一把钥匙', where))
    return false
  }
  return true
}

/**
 * 检查 certs/ 的布局与证书材料。
 * @param {object} context 上下文
 * @param {string} context.certsDir certs 目录
 * @param {Array<object>} context.problems 问题收集数组
 * @returns {{rootCa: boolean, eec: boolean, chainChecked: boolean, eecPub: boolean, rootCaPub: boolean}}
 */
export function checkCerts({ certsDir, problems }) {
  const stats = { rootCa: false, eec: false, chainChecked: false, eecPub: false, rootCaPub: false }
  if (!existsSync(certsDir) || !isDir(certsDir)) {
    problems.push(problem('error', 'CERTS_DIR_MISSING', '信任材料目录不存在:' + certsDir, 'certs'))
    return stats
  }

  for (const name of listFileNames(certsDir)) {
    problems.push(problem('error', 'CERTS_STRAY_FILE', 'certs/ 下只允许来源文件夹,发现散落文件 ' + name, 'certs/' + name))
  }
  const allowed = new Set([ROOT_CA_ID, COLLECTION_ID])
  for (const name of listDirNames(certsDir)) {
    if (!allowed.has(name)) {
      problems.push(problem('warning', 'CERTS_UNKNOWN_SOURCE', 'certs/ 下出现非本合集的来源文件夹 ' + name, 'certs/' + name))
    }
  }

  const rootDir = join(certsDir, ROOT_CA_ID)
  const rootCertPath = join(rootDir, ROOT_CA_FILE)
  let rootCertificate = null
  if (!existsSync(rootCertPath)) {
    problems.push(problem('error', 'ROOT_CA_MISSING', '缺资产侧根证书:' + ROOT_CA_ID + '/' + ROOT_CA_FILE + ',它是资产侧唯一信任锚', 'certs/' + ROOT_CA_ID))
  } else {
    rootCertificate = readCertificate(rootCertPath)
    if (!rootCertificate) {
      problems.push(problem('error', 'ROOT_CA_UNREADABLE', '根证书无法解析为 X.509:' + ROOT_CA_FILE, 'certs/' + ROOT_CA_ID + '/' + ROOT_CA_FILE))
    } else {
      stats.rootCa = true
      const where = 'certs/' + ROOT_CA_ID + '/' + ROOT_CA_FILE
      if (rootCertificate.ca !== true) {
        problems.push(problem('error', 'ROOT_CA_NOT_CA', '根证书的 basicConstraints 不是 CA:TRUE', where))
      }
      if (rootCertificate.subject !== rootCertificate.issuer) {
        problems.push(problem('error', 'ROOT_CA_NOT_SELF_SIGNED', '根证书不是自签:subject 与 issuer 不一致', where))
      } else if (!rootCertificate.verify(rootCertificate.publicKey)) {
        problems.push(problem('error', 'ROOT_CA_SIGNATURE_INVALID', '根证书的自签名验证失败', where))
      }
      checkValidity(rootCertificate, { label: '根证书', where, problems })
      stats.rootCaPub = checkPublicKeyMatch(rootCertificate, {
        pubPath: join(rootDir, ROOT_CA_PUB_FILE),
        label: '根证书',
        where,
        problems,
      })
    }
  }

  const eecDir = join(certsDir, COLLECTION_ID)
  const eecCertPath = join(eecDir, EEC_FILE)
  if (!existsSync(eecCertPath)) {
    problems.push(problem('error', 'EEC_CERT_MISSING', '缺合集终端签名证书:' + COLLECTION_ID + '/' + EEC_FILE, 'certs/' + COLLECTION_ID))
  } else {
    const certificate = readCertificate(eecCertPath)
    const where = 'certs/' + COLLECTION_ID + '/' + EEC_FILE
    if (!certificate) {
      problems.push(problem('error', 'EEC_CERT_UNREADABLE', '终端签名证书无法解析为 X.509:' + EEC_FILE, where))
    } else {
      stats.eec = true
      if (certificate.ca !== false) {
        problems.push(problem('error', 'EEC_CERT_IS_CA', '终端签名证书的 basicConstraints 必须是 CA:FALSE', where))
      }
      checkValidity(certificate, { label: '终端签名证书', where, problems })
      if (rootCertificate) {
        if (certificate.issuer !== rootCertificate.subject) {
          problems.push(
            problem('error', 'EEC_CERT_ISSUER_MISMATCH', '终端签名证书的签发者 ' + certificate.issuer + ' 与根证书主题 ' + rootCertificate.subject + ' 不一致', where),
          )
        } else if (!certificate.verify(rootCertificate.publicKey)) {
          problems.push(problem('error', 'EEC_CERT_SIGNATURE_INVALID', '终端签名证书不是该根证书签发:签名验证失败', where))
        } else {
          stats.chainChecked = true
        }
      }
      stats.eecPub = checkPublicKeyMatch(certificate, {
        pubPath: join(eecDir, EEC_PUB_FILE),
        label: '终端签名证书',
        where,
        problems,
      })
    }
  }

  return stats
}
