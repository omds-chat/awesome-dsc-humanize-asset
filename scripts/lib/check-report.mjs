/**
 * 检查结果的公共输出约定。
 *
 * 每个检查脚本都支持 --json,输出单个 JSON 对象(不是逐行文本),便于用命令行组合调用:
 *   node scripts/verify-catalog.mjs --json > temp/catalog.json
 *   node scripts/verify-pull.mjs --json | node -e "..." 
 *
 * 结果字段:
 *   ok        是否通过;只看 error 级问题,有 error 即 false
 *   check     检查项标识
 *   title     检查项名称
 *   target    本次检查的对象(目录或文件)
 *   counts    { errors, warnings, problems }
 *   problems  问题列表,每项含 code、path、message 与 level
 *   stats     该检查项的统计数字
 *   checks    仅汇总结果:每个子检查的 ok 与计数
 *
 * 退出码约定:0 通过,1 有 error 级问题,2 参数错误或运行失败。
 */

/** 构造一条问题记录。level 取 error 或 warning,path 相对检查对象。 */
export function problem(level, code, message, path = null) {
  return {
    code: String(code),
    path: path === undefined || path === null ? null : String(path).split('\\').join('/'),
    message: String(message),
    level,
  }
}

/** 把一组问题包装成单个检查结果。 */
export function buildResult({ check, title, target = null, problems = [], stats = {} }) {
  const normalized = problems.map((item) => problem(item.level, item.code, item.message, item.path))
  const errors = normalized.filter((item) => item.level === 'error').length
  return {
    ok: errors === 0,
    check,
    title,
    target: typeof target === 'string' ? target.split('\\').join('/') : null,
    counts: { errors, warnings: normalized.length - errors, problems: normalized.length },
    problems: normalized,
    stats,
  }
}

/** 把多个检查结果合并成一个总结果,problems 里每项多一个 check 字段标明来源。 */
export function mergeResults(results, { check = 'all', title = '全部检查' } = {}) {
  const problems = []
  for (const result of results) {
    for (const item of result.problems) problems.push({ check: result.check, ...item })
  }
  const errors = problems.filter((item) => item.level === 'error').length
  return {
    ok: errors === 0,
    check,
    title,
    target: null,
    counts: { errors, warnings: problems.length - errors, problems: problems.length },
    checks: results.map((result) => ({
      check: result.check,
      title: result.title,
      ok: result.ok,
      target: result.target,
      counts: result.counts,
    })),
    problems,
    stats: { checks: results.length },
  }
}

/** 把结果格式化成便于人读的文本。 */
export function formatText(result) {
  const lines = []
  for (const item of result.problems) {
    const level = item.level === 'error' ? '[错误]' : '[警告]'
    const location = item.path ? ' (' + item.path + ')' : ''
    const source = item.check ? item.check + ' ' : ''
    lines.push(level + ' ' + source + item.code + ' ' + item.message + location)
  }
  for (const item of result.checks ?? []) {
    lines.push(
      (item.ok ? '[通过] ' : '[未通过] ') + item.check + ' ' + item.title +
        ':错误 ' + item.counts.errors + ' 条,警告 ' + item.counts.warnings + ' 条',
    )
  }
  lines.push(
    (result.ok ? '检查通过 ' : '检查未通过 ') + result.check +
      (result.title ? '(' + result.title + ')' : '') +
      ':错误 ' + result.counts.errors + ' 条,警告 ' + result.counts.warnings + ' 条',
  )
  return lines.join('\n') + '\n'
}

/** 输出结果并给出退出码。 */
export function finish(result, json) {
  process.stdout.write(json ? JSON.stringify(result, null, 2) + '\n' : formatText(result))
  return result.ok ? 0 : 1
}

/** 把 --foo-bar 形式的参数名转成 fooBar。 */
function camel(name) {
  return name.replace(/-([a-z0-9])/g, (match, char) => char.toUpperCase())
}

/** 解析命令行参数,支持 --name value、--name=value 与布尔开关。 */
export function parseFlags(argv, spec) {
  const values = {}
  for (const [name, definition] of Object.entries(spec)) {
    values[name] = definition.default === undefined ? (definition.kind === 'flag' ? false : null) : definition.default
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) throw new Error('未知参数 ' + arg)
    const separator = arg.indexOf('=')
    const flag = separator === -1 ? arg : arg.slice(0, separator)
    const inline = separator === -1 ? null : arg.slice(separator + 1)
    const key = camel(flag.slice(2))
    const definition = spec[key]
    if (!definition) throw new Error('未知参数 ' + arg)
    if (definition.kind === 'flag') {
      if (inline !== null) throw new Error(flag + ' 不接受取值')
      values[key] = true
      continue
    }
    let value = inline
    if (value === null) {
      index += 1
      value = argv[index]
      if (value === undefined) throw new Error(flag + ' 缺少取值')
    }
    values[key] = value
  }
  return values
}

/** 检查脚本的统一入口:解析参数、跑检查、输出结果、给出退出码。 */
export function runCheckMain({ usage, flags, run }) {
  let options
  try {
    options = parseFlags(process.argv.slice(2), flags)
  } catch (error) {
    process.stderr.write('参数错误:' + error.message + '\n\n')
    usage()
    return 2
  }
  if (options.help) {
    usage()
    return 0
  }
  let result
  try {
    result = run(options)
  } catch (error) {
    process.stderr.write('检查失败:' + (error && error.message ? error.message : String(error)) + '\n')
    return 2
  }
  return finish(result, options.json === true)
}
