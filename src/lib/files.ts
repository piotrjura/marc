import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const IGNORE_DIRS = new Set([
  'node_modules', 'dist', '.next', '.cache', '.turbo',
  'build', 'coverage', '.output', '.nuxt', '.svelte-kit',
  '__pycache__', '.venv', 'venv', 'target',
])

function shouldSkipDir(name: string): boolean {
  if (IGNORE_DIRS.has(name)) return true
  if (name.startsWith('.') && name !== '.github') return true
  return false
}

export interface FileInfo {
  name: string
  relPath: string
  absPath: string
  size: number
  mtime: Date
  dir: string
}

export function scanMarkdownFiles(root: string): FileInfo[] {
  const files: FileInfo[] = []

  function walk(dir: string) {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!shouldSkipDir(entry.name)) walk(join(dir, entry.name))
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
        try {
          const fullPath = join(dir, entry.name)
          const stat = statSync(fullPath)
          files.push({
            name: entry.name,
            relPath: relative(root, fullPath),
            absPath: fullPath,
            size: stat.size,
            mtime: stat.mtime,
            dir: relative(root, dir) || '.',
          })
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walk(root)
  files.sort((a, b) => {
    const depthA = a.dir === '.' ? 0 : a.dir.split('/').length
    const depthB = b.dir === '.' ? 0 : b.dir.split('/').length
    if (depthA !== depthB) return depthA - depthB
    return b.mtime.getTime() - a.mtime.getTime()
  })
  return files
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
