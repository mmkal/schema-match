#!/usr/bin/env npx tsx
import {execSync} from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import {fileURLToPath} from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const tmpFileArg = process.argv.find(a => a.startsWith('--tmp-file='))
const inputFile = tmpFileArg ? tmpFileArg.slice('--tmp-file='.length) : null

let jsonFile: string
if (inputFile) {
  jsonFile = path.resolve(inputFile)
  console.log(`Using existing bench output: ${jsonFile}\n`)
} else {
  jsonFile = path.join(root, 'tmp-bench-output.json')
  console.log('Running benchmarks (this may take a minute)...\n')
  execSync(`pnpm vitest bench --run --outputJson ${jsonFile}`, {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

const data = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'))
if (!inputFile) fs.unlinkSync(jsonFile)

type Benchmark = {name: string; hz: number; rank: number}
type Group = {fullName: string; benchmarks: Benchmark[]}

const groups: Group[] = data.files.flatMap((f: {groups: Group[]}) => f.groups)
const groupsByFullName = new Map(groups.map(g => [g.fullName, g]))

const formatHz = (hz: number): string => {
  return Math.round(hz).toLocaleString('en-US')
}

const generateTable = (group: Group): string => {
  const sorted = [...group.benchmarks].sort((a, b) => b.hz - a.hz)
  const fastest = sorted[0].hz

  const rows = sorted.map(b => {
    const ratio = fastest / b.hz
    const vs = ratio < 1.005 ? 'fastest' : `${ratio.toFixed(2)}x slower`
    return `| ${b.name} | ${formatHz(b.hz)} | ${vs} |`
  })

  return [`| Matcher | ops/sec | vs fastest |`, `|---|---|---|`, ...rows].join('\n')
}

// Update README by finding each <!-- bench:fullName="..." --> marker
const readmePath = path.join(root, 'README.md')
let readme = fs.readFileSync(readmePath, 'utf-8')

const markerPattern = /<!-- bench:fullName="([^"]+)" -->/g
const referencedNames = new Set<string>()
let match: RegExpExecArray | null

// Collect all referenced fullNames first for validation
const allMatches: {fullName: string; index: number; marker: string}[] = []
while ((match = markerPattern.exec(readme)) !== null) {
  allMatches.push({fullName: match[1], index: match.index, marker: match[0]})
  referencedNames.add(match[1])
}

// Validate: every referenced fullName must exist in bench output
const missing = [...referencedNames].filter(name => !groupsByFullName.has(name))
if (missing.length > 0) {
  console.error('ERROR: README references benchmark groups that do not exist in the output:')
  for (const name of missing) {
    console.error(`  - "${name}"`)
  }
  console.error('\nAvailable groups:')
  for (const name of groupsByFullName.keys()) {
    console.error(`  - "${name}"`)
  }
  process.exit(1)
}

// Replace each marker + following table
for (const {fullName, marker} of allMatches.reverse()) {
  const group = groupsByFullName.get(fullName)!
  const markerIdx = readme.indexOf(marker)
  const afterMarker = markerIdx + marker.length

  // Find and replace the next markdown table after this marker (or insert if none)
  const tableStart = readme.indexOf('| Matcher', afterMarker)
  const nextMarker = readme.indexOf('<!-- bench:', afterMarker + 1)

  let tableEnd: number
  if (tableStart !== -1 && (nextMarker === -1 || tableStart < nextMarker)) {
    // Find end of table: last line starting with |
    let pos = tableStart
    while (pos < readme.length) {
      const lineEnd = readme.indexOf('\n', pos)
      if (lineEnd === -1) {
        tableEnd = readme.length
        break
      }
      const nextLineStart = lineEnd + 1
      if (nextLineStart >= readme.length || !readme[nextLineStart]?.startsWith('|')) {
        tableEnd = lineEnd
        break
      }
      pos = nextLineStart
    }
    tableEnd = tableEnd!
  } else {
    // No existing table found — insert after marker
    tableEnd = afterMarker
  }

  const table = generateTable(group)
  const rest = readme.slice(tableEnd).replace(/^\n*/, '')
  readme = readme.slice(0, afterMarker) + '\n\n' + table + '\n\n' + rest
}

fs.writeFileSync(readmePath, readme)

console.log(`Updated ${allMatches.length} benchmark tables in README.md.`)
