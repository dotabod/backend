import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

const spanSchema = z.object({
  column: z.number().int().positive(),
  length: z.number().int().nonnegative(),
  line: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
})
const labelSchema = z.object({ message: z.string().optional(), span: spanSchema })
const diagnosticSchema = z.object({
  code: z.string(),
  filename: z.string(),
  labels: z.array(labelSchema).min(1),
  message: z.string(),
  severity: z.string(),
})
const reportSchema = z.object({ diagnostics: z.array(diagnosticSchema) })
const summarySchema = z.object({
  code: z.string(),
  file: z.string(),
  labels: z.array(
    z.object({ context: z.array(z.string()), message: z.string(), span: z.string() })
  ),
  message: z.string(),
  severity: z.string(),
})
const baselineEntrySchema = z.object({
  count: z.number().int().positive(),
  diagnostic: summarySchema,
})
const policySchema = z.object({
  configSha256: z.string(),
  invocation: z.array(z.string()),
  oxlintVersion: z.string(),
})
const baselineSchema = z.object({
  diagnostics: z.record(z.string(), baselineEntrySchema),
  policy: policySchema,
  version: z.literal(2),
})

type Diagnostic = z.infer<typeof diagnosticSchema>
type Summary = z.infer<typeof summarySchema>
type BaselineEntry = z.infer<typeof baselineEntrySchema>
type Baseline = z.infer<typeof baselineSchema>
type Policy = z.infer<typeof policySchema>

const scriptDirectory = import.meta.dirname
const baselinePath = path.join(scriptDirectory, 'oxlint-baseline.json')
const oxlintExecutable = path.join(scriptDirectory, '../../node_modules/.bin/oxlint')
const oxlintArgs = [
  '--config',
  'oxlint.config.ts',
  '--type-aware',
  '--type-check',
  '--max-warnings=0',
  '--disable-nested-config',
  '--format',
  'json',
]

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

const sourceContext = (filename: string, lineNumber: number): string[] => {
  const lines = readFileSync(filename, 'utf-8').split(/\r?\n/u)
  return [lines[lineNumber - 2], lines[lineNumber - 1], lines[lineNumber]].map(
    (line) => line?.trim() ?? ''
  )
}

const summarizeLabel = (
  filename: string,
  label: Diagnostic['labels'][number]
): Summary['labels'][number] => {
  const absoluteFilename = path.resolve(filename)
  const repositoryPath = `${path.resolve('.')}${path.sep}`
  if (!absoluteFilename.startsWith(repositoryPath)) {
    throw new Error(`Oxlint reported a file outside this repository: ${filename}`)
  }
  const sourceBytes = Buffer.from(readFileSync(filename, 'utf-8'))
  if (label.span.offset + label.span.length > sourceBytes.byteLength) {
    throw new Error(`Oxlint reported an out-of-bounds span in ${filename}`)
  }
  return {
    context: sourceContext(filename, label.span.line),
    message: label.message ?? '',
    span: sourceBytes
      .subarray(label.span.offset, label.span.offset + label.span.length)
      .toString('utf-8'),
  }
}

const summarizeDiagnostic = (diagnostic: Diagnostic): Summary => {
  if (
    diagnostic.code === 'typescript(tsconfig-error)' ||
    diagnostic.message.startsWith('Invalid tsconfig')
  ) {
    throw new Error(`Oxlint configuration error: ${diagnostic.message}`)
  }
  return {
    code: diagnostic.code,
    file: diagnostic.filename,
    labels: diagnostic.labels.map((label) => summarizeLabel(diagnostic.filename, label)),
    message: diagnostic.message,
    severity: diagnostic.severity,
  }
}

const looseHash = (summary: Summary): string =>
  sha256(
    JSON.stringify({
      code: summary.code,
      file: summary.file,
      labels: summary.labels.map((label) => ({
        currentLine: label.context[1],
        message: label.message,
      })),
      message: summary.message,
      severity: summary.severity,
    })
  )

const countDiagnostics = (diagnostics: Diagnostic[]): Record<string, BaselineEntry> => {
  const counts = new Map<string, BaselineEntry>()
  for (const diagnostic of diagnostics) {
    const summary = summarizeDiagnostic(diagnostic)
    const hash = sha256(JSON.stringify(summary))
    const existing = counts.get(hash)
    counts.set(hash, { count: (existing?.count ?? 0) + 1, diagnostic: summary })
  }
  return Object.fromEntries([...counts].toSorted(([left], [right]) => left.localeCompare(right)))
}

const runCommand = (args: string[]) => {
  const result = spawnSync(oxlintExecutable, args, {
    encoding: 'utf-8',
    maxBuffer: 128 * 1024 * 1024,
  })
  if (result.error !== undefined) {
    throw result.error
  }
  if (result.status === null || (result.status !== 0 && result.status !== 1)) {
    throw new Error(`Oxlint infrastructure failure status ${result.status}: ${result.stderr}`)
  }
  return result
}

const runOxlint = (): Record<string, BaselineEntry> => {
  const result = runCommand(oxlintArgs)
  return countDiagnostics(reportSchema.parse(JSON.parse(result.stdout)).diagnostics)
}

const currentPolicy = (): Policy => {
  const result = runCommand(['--version'])
  if (result.status !== 0) {
    throw new Error(`Could not read Oxlint version: ${result.stderr}`)
  }
  return {
    configSha256: sha256(readFileSync('oxlint.config.ts', 'utf-8')),
    invocation: oxlintArgs,
    oxlintVersion: result.stdout.trim(),
  }
}

const totalCount = (diagnostics: Record<string, BaselineEntry>): number =>
  Object.values(diagnostics).reduce((total, entry) => total + entry.count, 0)

const differences = (
  current: Record<string, BaselineEntry>,
  baseline: Record<string, BaselineEntry>
) => {
  const fingerprints = new Set([...Object.keys(current), ...Object.keys(baseline)])
  const additions: BaselineEntry[] = []
  const removals: BaselineEntry[] = []
  for (const hash of fingerprints) {
    const currentEntry = current[hash]
    const baselineEntry = baseline[hash]
    const currentCount = currentEntry?.count ?? 0
    const baselineCount = baselineEntry?.count ?? 0
    if (currentCount > baselineCount && currentEntry !== undefined) {
      additions.push({ ...currentEntry, count: currentCount - baselineCount })
    }
    if (baselineCount > currentCount && baselineEntry !== undefined) {
      removals.push({ ...baselineEntry, count: baselineCount - currentCount })
    }
  }
  const looseMatches = new Map<string, { additions: BaselineEntry[]; removals: BaselineEntry[] }>()
  for (const addition of additions) {
    const hash = looseHash(addition.diagnostic)
    const match = looseMatches.get(hash) ?? { additions: [], removals: [] }
    match.additions.push(addition)
    looseMatches.set(hash, match)
  }
  for (const removal of removals) {
    const hash = looseHash(removal.diagnostic)
    const match = looseMatches.get(hash) ?? { additions: [], removals: [] }
    match.removals.push(removal)
    looseMatches.set(hash, match)
  }
  for (const match of looseMatches.values()) {
    if (
      match.additions.length === 1 &&
      match.removals.length === 1 &&
      match.additions[0].count === 1 &&
      match.removals[0].count === 1
    ) {
      additions.splice(additions.indexOf(match.additions[0]), 1)
      removals.splice(removals.indexOf(match.removals[0]), 1)
    }
  }
  return { additions, removals }
}

const reportChanges = (additions: BaselineEntry[], removals: BaselineEntry[]): void => {
  console.error(
    `Oxlint ratchet failed: ${additions.length} new and ${removals.length} stale diagnostic fingerprints.`
  )
  for (const entry of additions.slice(0, 20)) {
    console.error(`NEW (${entry.count}) ${JSON.stringify(entry.diagnostic)}`)
  }
  for (const entry of removals.slice(0, 20)) {
    console.error(`STALE (${entry.count}) ${JSON.stringify(entry.diagnostic)}`)
  }
}

const bootstrap = (diagnostics: Record<string, BaselineEntry>, policy: Policy): void => {
  if (process.env.OXLINT_BASELINE_BOOTSTRAP !== '1') {
    throw new Error('Set OXLINT_BASELINE_BOOTSTRAP=1 to bootstrap the checked-in baseline.')
  }
  writeFileSync(baselinePath, `${JSON.stringify({ diagnostics, policy, version: 2 }, null, 2)}\n`)
  console.log(`Wrote ${totalCount(diagnostics)} Oxlint diagnostic fingerprints.`)
}

const main = (): void => {
  const diagnostics = runOxlint()
  const policy = currentPolicy()
  if (process.argv.includes('--bootstrap')) {
    bootstrap(diagnostics, policy)
    return
  }
  const baseline: Baseline = baselineSchema.parse(JSON.parse(readFileSync(baselinePath, 'utf-8')))
  if (JSON.stringify(baseline.policy) !== JSON.stringify(policy)) {
    throw new Error(
      'Oxlint policy changed (invocation, config hash, or version); review and deliberately update the checked-in baseline.'
    )
  }
  const { additions, removals } = differences(diagnostics, baseline.diagnostics)
  if (process.argv.includes('--prune')) {
    if (additions.length > 0) {
      throw new Error('Refusing to prune while new Oxlint diagnostics exist.')
    }
    if (removals.length > 0) {
      writeFileSync(baselinePath, `${JSON.stringify({ ...baseline, diagnostics }, null, 2)}\n`)
      console.log(`Pruned ${removals.length} stale Oxlint diagnostic fingerprints.`)
    }
    return
  }
  if (additions.length === 0 && removals.length === 0) {
    console.log(`Oxlint ratchet passed: ${totalCount(diagnostics)} baseline diagnostics.`)
    return
  }
  reportChanges(additions, removals)
  throw new Error(
    'Resolve stale diagnostics or prune them after confirming there are no additions.'
  )
}

main()
