#!/usr/bin/env node
/**
 * 拉取结果的形状校验:只看 assets/ 树,不看清单与签名。
 *
 * 用途是在构建之后、签名之前先确认「拉下来的东西本身是合规的资产包」:
 * 作者清单与包清单是否与目录一致、versions.json 的 latest 是否在列表内、
 * 每个版本目录的包根条目是否只含元数据与已声明的类型目录、类型声明与内容是否双向一致、
 * 内容标识是否在同一类型内唯一、索引 assets.json 是否与树对得上。
 *
 * 用法:
 *   node scripts/verify-pull.mjs --dir dist/pages
 *   node scripts/verify-pull.mjs --dir dist/pages --json
 */

import { resolve } from 'node:path'
import { buildResult, runCheckMain } from './lib/check-report.mjs'
import { isDir } from './lib/collection.mjs'
import { validateAssetsTree } from './lib/tree.mjs'

function usage() {
  process.stdout.write([
    '用法: node scripts/verify-pull.mjs [选项]',
    '',
    '选项:',
    '  --dir <目录>       发布目录或拉取暂存目录,默认 dist/pages',
    '  --format-version   期望的包格式版本;给出时逐包比对 asset.json 的 formatVersion',
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
    dir: { kind: 'value', default: 'dist/pages' },
    formatVersion: { kind: 'value', default: null },
    json: { kind: 'flag' },
    help: { kind: 'flag' },
  },
  run(options) {
    const dir = resolve(options.dir)
    const problems = []
    if (!isDir(dir)) throw new Error('目录不存在:' + dir)
    const stats = validateAssetsTree(dir, {
      problems,
      requireIndex: false,
      expectedFormatVersion: options.formatVersion,
    })
    return buildResult({ check: 'pull', title: '拉取结果形状', target: dir, problems, stats })
  },
})
