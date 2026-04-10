import React from 'react'
import { withFullScreen } from 'fullscreen-ink'
import { readFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { App } from './app.js'
import { scanMarkdownFiles } from './lib/files.js'
import { searchFileContents } from './lib/search.js'

const args = process.argv.slice(2)
const subcommand = args[0]
const filePath = subcommand !== 'search' ? args.find(a => !a.startsWith('-')) : undefined
const presentationFlag = args.includes('-p') || args.includes('--presentation')

function isUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://')
}

/** Convert GitHub blob URLs to raw.githubusercontent.com URLs. */
function toRawGitHubUrl(url: string): string {
  const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/)
  if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`
  return url
}

function fileNameFromUrl(url: string): string {
  const pathname = new URL(url).pathname
  const last = pathname.split('/').filter(Boolean).pop()
  return last || 'remote.md'
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`marc — markdown reader for the terminal

Usage:
  marc              Browse markdown files in current directory
  marc <file>       Open a specific markdown file
  marc <url>        Open a markdown file from a remote URL
  marc <file> -p    Open directly in presentation mode
  marc search <q>   Search inside markdown files
  marc --help       Show this help

Options:
  -p, --presentation   Start in presentation mode (requires a file)

File browser:
  j / ↓             Navigate down
  k / ↑             Navigate up
  Enter             Open file
  /                 Search by filename
  ?                 Search inside file contents
  [ / ]             Previous / next page
  Esc               Clear search
  q                 Quit

Reader:
  ↓ / ↑             Scroll line by line
  PgDn / PgUp       Half page scroll
  [ / ]             Previous / next heading
  /                 Search in document
  n / N             Next / previous match
  p                 Enter presentation mode
  e                 Open in $EDITOR
  r                 Reload file
  Esc               Back to file list
  q                 Quit

Presentation mode (p to enter):
  → / Space / l     Next slide
  ← / h             Previous slide
  ↓ / j             Focus next block
  ↑ / k             Focus previous block
  p / Esc           Exit presentation
  q                 Quit`)
  process.exit(0)
}

if (subcommand === 'search') {
  const query = args.slice(1).join(' ')
  if (!query) {
    console.error('Usage: marc search <query>')
    process.exit(1)
  }
  const files = scanMarkdownFiles(process.cwd())
  const results = searchFileContents(files, query)
  if (results.length === 0) {
    console.log(`No results for "${query}"`)
    process.exit(0)
  }
  for (const result of results) {
    console.log(`\x1b[1m${result.file.relPath}\x1b[0m`)
    for (const match of result.matches) {
      console.log(`  \x1b[2mL${match.lineNum}:\x1b[0m ${match.text}`)
    }
  }
  process.exit(0)
}

if (filePath && isUrl(filePath)) {
  // Remote URL mode
  const rawUrl = toRawGitHubUrl(filePath)
  const name = fileNameFromUrl(rawUrl)
  let content: string
  try {
    const res = await fetch(rawUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    content = await res.text()
  } catch (err) {
    console.error(`marc: cannot fetch "${filePath}"${err instanceof Error ? ` — ${err.message}` : ''}`)
    process.exit(1)
  }

  const app = withFullScreen(
    <App initialFile={{ name, absPath: rawUrl, content }} initialPresentation={presentationFlag} />
  )
  await app.start()
  await app.waitUntilExit()
} else if (filePath) {
  // Direct file mode
  const absPath = resolve(filePath)
  let content: string
  try {
    content = readFileSync(absPath, 'utf-8')
  } catch {
    console.error(`marc: cannot read "${filePath}"`)
    process.exit(1)
  }

  const app = withFullScreen(
    <App initialFile={{ name: basename(filePath), absPath, content }} initialPresentation={presentationFlag} />
  )
  await app.start()
  await app.waitUntilExit()
} else {
  // Browser mode
  if (presentationFlag) {
    console.error('marc: -p/--presentation requires a file argument')
    process.exit(1)
  }
  const app = withFullScreen(<App />)
  await app.start()
  await app.waitUntilExit()
}
