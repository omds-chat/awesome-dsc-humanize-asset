#!/usr/bin/env node
/**
 * 仓库级校验:只查 catalog/、certs/ 与 site/ 的合集设置,不碰任何构建产物。
 *
 * 查三件事:
 *   catalog/   收录登记的形状:作者目录名即 username、包目录名即包标识、字段封闭、标签取自预设词表、下架记录与登记不矛盾
 *   certs/     信任材料的布局与证书链:根证书是资产侧唯一锚,EEC 由该根签发、CA:FALSE、未过期
 *   site/      合集元数据与预设标签词表的形状
 *
 * 本脚本不签名、不验签,也不生成任何证书;发布目录的校验是 scripts/verify-bundle.mjs。
 *
 * 用法:
 *   node scripts/verify-catalog.mjs
 *   node scripts/verify-catalog.mjs --catalog catalog --certs certs --tags site/tags.json --meta site/meta.json
 *   node scripts/verify-catalog.mjs --json > temp/catalog.json
 */

import { resolve } from 'node:path'
import { checkCerts } from './lib/certs.mjs'
import { checkPresetTags, checkRemoved, readCatalog, readPresetTags } from './lib/catalog.mjs'
import { buildResult, runCheckMain } from './lib/check-report.mjs'
import { readCollectionMeta } from './lib/meta.mjs'

function usage() {
  process.stdout.write([
    '用法: node scripts/verify-catalog.mjs [选项]',
    '',
    '选项:',
    '  --catalog <目录>   登记目录,默认 catalog',
    '  --certs <目录>     信任材料目录,默认 certs',
    '  --tags <文件>      预设标签词表,默认 site/tags.json',
    '  --meta <文件>      合集元数据,默认 site/meta.json',
    '  --json             以 JSON 输出校验结果',
    '  --help             显示本说明',
    '',
    '退出码: 0 通过,1 有 error 级问题,2 参数错误或运行失败',
    '',
  ].join('\n'))
}

process.exitCode = runCheckMain({
  usage,
  flags: {
    catalog: { kind: 'value', default: 'catalog' },
    certs: { kind: 'value', default: 'certs' },
    tags: { kind: 'value', default: 'site/tags.json' },
    meta: { kind: 'value', default: 'site/meta.json' },
    json: { kind: 'flag' },
    help: { kind: 'flag' },
  },
  run(options) {
    const problems = []
    const catalogDir = resolve(options.catalog)
    const certsDir = resolve(options.certs)
    const presetTags = readPresetTags(resolve(options.tags), problems)
    const catalog = readCatalog({ catalogDir, problems })
    checkPresetTags(catalog.packages, presetTags, problems)
    const removed = checkRemoved({ catalogDir, packages: catalog.packages, problems })
    const certStats = checkCerts({ certsDir, problems })
    const collectionMeta = readCollectionMeta(resolve(options.meta), problems)

    return buildResult({
      check: 'catalog',
      title: '登记、信任材料与合集设置',
      target: catalogDir,
      problems,
      stats: {
        authors: catalog.authors.length,
        packages: catalog.packages.length,
        presetTags: presetTags.length,
        removed,
        assetSpecVersion: collectionMeta?.assetSpecVersion ?? null,
        assetFormatVersion: collectionMeta?.assetFormatVersion ?? null,
        certs: certStats,
      },
    })
  },
})
