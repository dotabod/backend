import { spawnSync } from 'node:child_process'
import { Project, SyntaxKind } from 'ts-morph'

type Diagnostic = {
  code: string
  filename: string
  message: string
  labels: { span: { offset: number; length: number; line: number; column: number } }[]
}

const result = spawnSync('npx', ['oxlint', '--format=json'], { encoding: 'utf8' })
const { diagnostics } = JSON.parse(result.stdout) as { diagnostics: Diagnostic[] }

const unused = diagnostics.filter((d) => d.code === 'eslint(no-unused-vars)')
console.log(`Found ${unused.length} no-unused-vars diagnostics`)

const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
  skipAddingFilesFromTsConfig: true,
})

const byFile = new Map<string, Diagnostic[]>()
for (const d of unused) {
  const arr = byFile.get(d.filename) ?? []
  arr.push(d)
  byFile.set(d.filename, arr)
}

let removed = 0
let renamed = 0
let skipped = 0

for (const [filename, diags] of byFile) {
  const source = project.addSourceFileAtPathIfExists(filename)
  if (!source) {
    console.warn(`  skip (not found): ${filename}`)
    skipped += diags.length
    continue
  }

  diags.sort((a, b) => b.labels[0].span.offset - a.labels[0].span.offset)

  for (const d of diags) {
    const offset = d.labels[0].span.offset
    const ident = source.getDescendantAtPos(offset)
    if (!ident) {
      console.warn(`  skip (no node): ${filename}:${d.labels[0].span.line}`)
      skipped++
      continue
    }

    const parent = ident.getParent()
    if (!parent) {
      skipped++
      continue
    }

    const kind = parent.getKind()
    const isParam = d.message.includes('Parameter')

    if (isParam) {
      const name = ident.getText()
      ident.replaceWithText(`_${name}`)
      renamed++
      continue
    }

    let toRemove = parent
    if (kind === SyntaxKind.VariableDeclaration || kind === SyntaxKind.BindingElement) {
      const stmt = parent.getFirstAncestorByKind(SyntaxKind.VariableStatement)
      if (stmt) toRemove = stmt
    }

    try {
      ;(toRemove as unknown as { remove: () => void }).remove()
      removed++
    } catch (e) {
      console.warn(
        `  failed to remove ${filename}:${d.labels[0].span.line} — ${(e as Error).message}`,
      )
      skipped++
    }
  }

  source.saveSync()
}

console.log(`\nRemoved: ${removed}  Renamed: ${renamed}  Skipped: ${skipped}`)
