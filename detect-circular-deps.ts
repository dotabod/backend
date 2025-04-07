#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'

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
const importRegex = /import\s+(?:(?:[\w*\s{},]*)\s+from\s+)?['"]([@\w\-./\\]+)['"]/g
const dynamicImportRegex = /import\s*\(\s*['"]([@\w\-./\\]+)['"]\s*\)/g
const requireRegex = /require\s*\(\s*['"]([@\w\-./\\]+)['"]\s*\)/g

// Function to determine if a path is a directory
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

// Function to check if a module is internal or external
function isInternalModule(modulePath: string): boolean {
  return (
    modulePath.startsWith('./') ||
    modulePath.startsWith('../') ||
    modulePath.startsWith('/') ||
    /^@dotabod\//.test(modulePath)
  )
}

// Function to resolve a relative import to an absolute path
function resolveImport(importPath: string, currentFile: string): string | null {
  if (!isInternalModule(importPath)) {
    // If it's not an internal module, skip it
    if (importPath.startsWith('@dotabod/')) {
      // Handle workspace packages
      const packageName = importPath.split('/')[1]
      return join(process.cwd(), 'packages', packageName, 'src')
    }
    return null
  }

  // Handle relative paths
  const currentDir = dirname(currentFile)
  const resolvedPath = resolve(currentDir, importPath)

  // Check if the path exists, if not try adding extensions
  if (!existsSync(resolvedPath)) {
    // Try with extensions
    for (const ext of extensions) {
      const pathWithExt = resolvedPath + ext
      if (existsSync(pathWithExt)) {
        return pathWithExt
      }
    }

    // Try as directory with index file
    if (isDirectory(resolvedPath)) {
      for (const ext of extensions) {
        const indexPath = join(resolvedPath, `index${ext}`)
        if (existsSync(indexPath)) {
          return indexPath
        }
      }
    }

    // Try without .js extension in import (TypeScript often omits it)
    if (importPath.endsWith('.js')) {
      const pathWithoutJs = resolve(currentDir, importPath.slice(0, -3))
      for (const ext of extensions) {
        const pathWithExt = pathWithoutJs + ext
        if (existsSync(pathWithExt)) {
          return pathWithExt
        }
      }
    }

    return null
  }

  return resolvedPath
}

// Function to extract imports from a file
function extractImports(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const imports: string[] = []

    // Find all import statements
    let match: RegExpExecArray | null

    importRegex.lastIndex = 0
    match = importRegex.exec(content)
    while (match !== null) {
      imports.push(match[1])
      match = importRegex.exec(content)
    }

    dynamicImportRegex.lastIndex = 0
    match = dynamicImportRegex.exec(content)
    while (match !== null) {
      imports.push(match[1])
      match = dynamicImportRegex.exec(content)
    }

    requireRegex.lastIndex = 0
    match = requireRegex.exec(content)
    while (match !== null) {
      imports.push(match[1])
      match = requireRegex.exec(content)
    }

    return imports
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error)
    return []
  }
}

// Function to process a file and extract its dependencies
function processFile(filePath: string): void {
  if (processedFiles.has(filePath)) return
  processedFiles.add(filePath)

  // Skip non-source files
  const ext = extname(filePath)
  if (!extensions.has(ext)) return

  const imports = extractImports(filePath)
  const fileDeps = new Set<string>()
  dependencies.set(filePath, fileDeps)

  for (const importPath of imports) {
    if (!isInternalModule(importPath)) {
      // Skip external modules
      if (externalModules.has(importPath)) continue

      // Skip node built-ins and other external packages
      if (!importPath.startsWith('@dotabod/')) continue
    }

    const resolvedImport = resolveImport(importPath, filePath)
    if (resolvedImport) {
      fileDeps.add(resolvedImport)
      // Recursively process this import if we haven't already
      processFile(resolvedImport)
    }
  }
}

// Function to scan a directory recursively
function scanDirectory(dir: string, ignorePatterns: RegExp[] = []): void {
  try {
    const entries = readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      // Skip ignored patterns
      if (ignorePatterns.some((pattern) => pattern.test(fullPath))) {
        continue
      }

      if (entry.isDirectory()) {
        // Skip node_modules and .git directories
        if (entry.name === 'node_modules' || entry.name === '.git') {
          continue
        }
        scanDirectory(fullPath, ignorePatterns)
      } else if (entry.isFile() && extensions.has(extname(entry.name))) {
        processFile(fullPath)
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error)
  }
}

// Function to find cycles in the dependency graph using DFS
function findCycles(): Map<string, string[]> {
  const cycles = new Map<string, string[]>()
  const visited = new Set<string>()
  const stack = new Set<string>()

  function dfs(node: string, path: string[] = []): void {
    if (stack.has(node)) {
      // Found a cycle
      const cycleStart = path.indexOf(node)
      const cycle = [...path.slice(cycleStart), node]

      // Store the cycle with the alphabetically first file as the key
      const firstFile = [...cycle].sort()[0]
      if (!cycles.has(firstFile)) {
        cycles.set(firstFile, cycle)
      }
      return
    }

    if (visited.has(node)) return

    visited.add(node)
    stack.add(node)
    path.push(node)

    const deps = dependencies.get(node)
    if (deps) {
      for (const dep of deps) {
        dfs(dep, [...path])
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
function formatPath(path: string): string {
  return relative(process.cwd(), path)
}

// Function to generate a visualization of the circular dependency
function visualizeCycle(cycle: string[]): string {
  return `${cycle.map(formatPath).join(' → ')} → ${formatPath(cycle[0])}`
}

// Main function
async function main() {
  const startTime = Date.now()
  console.log('Scanning for circular dependencies...')

  // Scan all packages
  const packagesDir = join(process.cwd(), 'packages')
  scanDirectory(packagesDir)

  console.log(
    `Scanned ${processedFiles.size} files and found ${dependencies.size} with dependencies.`,
  )

  // Find cycles
  const cycles = findCycles()

  if (cycles.size === 0) {
    console.log('No circular dependencies found! 🎉')
  } else {
    console.log(`Found ${cycles.size} circular dependencies:`)
    console.log('-'.repeat(80))

    const sortedCycles = [...cycles.entries()].sort((a, b) =>
      formatPath(a[0]).localeCompare(formatPath(b[0])),
    )

    sortedCycles.forEach(([file, cycle], index) => {
      console.log(`${index + 1}. Circular dependency involving ${formatPath(file)}:`)
      console.log(`   ${visualizeCycle(cycle)}`)
      console.log('-'.repeat(80))
    })

    // Group cycles by package
    const cyclesByPackage = new Map<string, number>()
    for (const [file] of sortedCycles) {
      const packageMatch = formatPath(file).match(/^packages\/([^/]+)/)
      if (packageMatch) {
        const packageName = packageMatch[1]
        cyclesByPackage.set(packageName, (cyclesByPackage.get(packageName) || 0) + 1)
      }
    }

    console.log('Circular dependencies by package:')
    const sortedPackages = [...cyclesByPackage.entries()].sort((a, b) => b[1] - a[1])
    sortedPackages.forEach(([pkg, count]) => {
      console.log(`- ${pkg}: ${count} circular dependencies`)
    })
  }

  const endTime = Date.now()
  console.log(`Analysis completed in ${(endTime - startTime) / 1000} seconds.`)
}

main().catch(console.error)
