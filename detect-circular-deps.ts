#!/usr/bin/env -S pnpm dlx tsx

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

// Tracks dependencies between files
const dependencies = new Map<string, Set<string>>()
// Tracks which files we've already processed
const processedFiles = new Set<string>()
// File extensions to process
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
// Known external modules that should be ignored
const externalModules = new Set([
  'react',
  'i18next',
  'socket.io',
  'winston',
  '@supabase/supabase-js',
  '@twurple/api',
  '@twurple/auth',
  '@twurple/eventsub-base',
])

// Regular expressions for extracting imports
const importRegex = /import\s+(?:(?:[\w*\s{},]*)\s+from\s+)?['"](?<modulePath>[@\w\-./\\]+)['"]/gu
const dynamicImportRegex = /import\s*\(\s*['"](?<modulePath>[@\w\-./\\]+)['"]\s*\)/gu
const requireRegex = /require\s*\(\s*['"](?<modulePath>[@\w\-./\\]+)['"]\s*\)/gu

// Function to determine if a path is a directory
const isDirectory = function isDirectory(candidatePath: string): boolean {
  try {
    return statSync(candidatePath).isDirectory()
  } catch {
    return false
  }
}

// Function to check if a module is internal or external
const isInternalModule = function isInternalModule(modulePath: string): boolean {
  return (
    modulePath.startsWith('./') ||
    modulePath.startsWith('../') ||
    modulePath.startsWith('/') ||
    modulePath.startsWith('@dotabod/')
  )
}

const findPathWithExtension = function findPathWithExtension(basePath: string): string | null {
  for (const extension of extensions) {
    const candidatePath = `${basePath}${extension}`
    if (existsSync(candidatePath)) {
      return candidatePath
    }
  }
  return null
}

const findDirectoryIndex = function findDirectoryIndex(directoryPath: string): string | null {
  if (!isDirectory(directoryPath)) {
    return null
  }
  for (const extension of extensions) {
    const candidatePath = path.join(directoryPath, `index${extension}`)
    if (existsSync(candidatePath)) {
      return candidatePath
    }
  }
  return null
}

const resolveImport = function resolveImport(
  importPath: string,
  currentFile: string
): string | null {
  if (importPath.startsWith('@dotabod/')) {
    const [, packageName] = importPath.split('/')
    return packageName === undefined
      ? null
      : path.join(process.cwd(), 'packages', packageName, 'src')
  }
  if (!isInternalModule(importPath)) {
    return null
  }

  const currentDirectory = path.dirname(currentFile)
  const resolvedPath = path.resolve(currentDirectory, importPath)
  if (existsSync(resolvedPath)) {
    return resolvedPath
  }

  const directMatch = findPathWithExtension(resolvedPath) ?? findDirectoryIndex(resolvedPath)
  if (directMatch !== null || !importPath.endsWith('.js')) {
    return directMatch
  }
  return findPathWithExtension(path.resolve(currentDirectory, importPath.slice(0, -3)))
}

const extractRegexMatches = function extractRegexMatches(
  content: string,
  expression: RegExp
): string[] {
  expression.lastIndex = 0
  return [...content.matchAll(expression)].flatMap((match) => {
    const modulePath = match.groups?.modulePath
    return modulePath === undefined ? [] : [modulePath]
  })
}

const extractImports = function extractImports(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, 'utf-8')
    return [
      ...extractRegexMatches(content, importRegex),
      ...extractRegexMatches(content, dynamicImportRegex),
      ...extractRegexMatches(content, requireRegex),
    ]
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error)
    return []
  }
}

// Function to process a file and extract its dependencies
const processFile = function processFile(filePath: string): void {
  if (processedFiles.has(filePath)) {
    return
  }
  processedFiles.add(filePath)

  // Skip non-source files
  const ext = path.extname(filePath)
  if (!extensions.has(ext)) {
    return
  }

  const imports = extractImports(filePath)
  const fileDeps = new Set<string>()
  dependencies.set(filePath, fileDeps)

  for (const importPath of imports) {
    if (!isInternalModule(importPath) || externalModules.has(importPath)) {
      continue
    }

    const resolvedImport = resolveImport(importPath, filePath)
    if (resolvedImport !== null && resolvedImport.length > 0) {
      fileDeps.add(resolvedImport)
      processFile(resolvedImport)
    }
  }
}

// Function to scan a directory recursively
const scanDirectory = function scanDirectory(dir: string, ignorePatterns: RegExp[] = []): void {
  try {
    const entries = readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const isIgnored =
        ignorePatterns.some((pattern) => pattern.test(fullPath)) ||
        entry.name === 'node_modules' ||
        entry.name === '.git'
      if (!isIgnored) {
        if (entry.isDirectory()) {
          scanDirectory(fullPath, ignorePatterns)
        } else if (entry.isFile() && extensions.has(path.extname(entry.name))) {
          processFile(fullPath)
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error)
  }
}

// Function to find cycles in the dependency graph using DFS
const findCycles = function findCycles(): Map<string, string[]> {
  const cycles = new Map<string, string[]>()
  const visited = new Set<string>()
  const stack = new Set<string>()

  const dfs = function dfs(node: string, traversalPath: string[] = []): void {
    if (stack.has(node)) {
      // Found a cycle
      const cycleStart = traversalPath.indexOf(node)
      const cycle = [...traversalPath.slice(cycleStart), node]

      // Store the cycle with the alphabetically first file as the key
      const [firstFile] = cycle.toSorted()
      if (firstFile !== undefined && !cycles.has(firstFile)) {
        cycles.set(firstFile, cycle)
      }
      return
    }

    if (visited.has(node)) {
      return
    }

    visited.add(node)
    stack.add(node)
    traversalPath.push(node)

    const deps = dependencies.get(node)
    if (deps) {
      for (const dep of deps) {
        dfs(dep, [...traversalPath])
      }
    }

    stack.delete(node)
  }

  // Run DFS from each node
  for (const node of dependencies.keys()) {
    dfs(node)
  }

  return cycles
}

// Function to format a path for display
const formatPath = function formatPath(filePath: string): string {
  return path.relative(process.cwd(), filePath)
}

// Function to generate a visualization of the circular dependency
const visualizeCycle = function visualizeCycle(cycle: string[]): string {
  const [firstFile] = cycle
  return firstFile === undefined
    ? ''
    : `${cycle.map(formatPath).join(' → ')} → ${formatPath(firstFile)}`
}

// Main function
const main = function main(): void {
  const startTime = Date.now()
  console.log('Scanning for circular dependencies...')

  // Scan all packages
  const packagesDir = path.join(process.cwd(), 'packages')
  scanDirectory(packagesDir)

  console.log(
    `Scanned ${processedFiles.size} files and found ${dependencies.size} with dependencies.`
  )

  // Find cycles
  const cycles = findCycles()

  if (cycles.size === 0) {
    console.log('No circular dependencies found! 🎉')
  } else {
    console.log(`Found ${cycles.size} circular dependencies:`)
    console.log('-'.repeat(80))

    const sortedCycles = [...cycles.entries()].toSorted((a, b) =>
      formatPath(a[0]).localeCompare(formatPath(b[0]))
    )

    for (const [index, [file, cycle]] of sortedCycles.entries()) {
      console.log(`${index + 1}. Circular dependency involving ${formatPath(file)}:`)
      console.log(`   ${visualizeCycle(cycle)}`)
      console.log('-'.repeat(80))
    }

    // Group cycles by package
    const cyclesByPackage = new Map<string, number>()
    for (const [file] of sortedCycles) {
      const packageMatch = /^packages\/(?<packageName>[^/]+)/u.exec(formatPath(file))
      const packageName = packageMatch?.groups?.packageName
      if (packageName !== undefined) {
        cyclesByPackage.set(packageName, (cyclesByPackage.get(packageName) ?? 0) + 1)
      }
    }

    console.log('Circular dependencies by package:')
    const sortedPackages = [...cyclesByPackage.entries()].toSorted((a, b) => b[1] - a[1])
    for (const [pkg, count] of sortedPackages) {
      console.log(`- ${pkg}: ${count} circular dependencies`)
    }
  }

  const endTime = Date.now()
  console.log(`Analysis completed in ${(endTime - startTime) / 1000} seconds.`)
}

main()
