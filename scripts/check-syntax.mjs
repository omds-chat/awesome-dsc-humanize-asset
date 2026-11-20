#!/usr/bin/env node
/**
 * 语法自检:全部脚本都能被当前 Node 解析。
 *
 * 只调用 node --check,不执行脚本、不联网、不安装依赖。用于在提交前拦住语法错误,
 * 让 CI 的下一步失败原因集中在语义而不是解析。
 */

import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = fileURLToPath(new URL('.', import.meta.url))
const root = join(scriptsDir, '..')

/** 递归收集 .mjs 文件,按路径排序。 */
function collect(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) files.push(...collect(path))
    else if (entry.endsWith('.mjs')) files.push(path)
  }
  return files.sort()
}

const files = collect(scriptsDir)
let failed = 0
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
    process.stdout.write('[通过] ' + relative(root, file).split('\\').join('/') + '\n')
  } catch (error) {
    failed += 1
    process.stdout.write('[失败] ' + relative(root, file).split('\\').join('/') + '\n')
    if (error.stderr) process.stdout.write(String(error.stderr))
  }
}
process.stdout.write('语法自检:' + (files.length - failed) + '/' + files.length + ' 通过\n')
process.exitCode = failed === 0 ? 0 : 1
