import { readFileSync } from 'node:fs'
import type { FileInfo } from './files.js'

export interface SearchMatch {
  lineNum: number
  text: string
}

export interface SearchResult {
  file: FileInfo
  matches: SearchMatch[]
}

export function searchFileContents(files: FileInfo[], query: string, maxPerFile = 3): SearchResult[] {
  if (!query) return []
  const q = query.toLowerCase()
  const results: SearchResult[] = []

  for (const file of files) {
    try {
      const content = readFileSync(file.absPath, 'utf-8')
      const lines = content.split('\n')
      const matches: SearchMatch[] = []

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(q)) {
          matches.push({ lineNum: i + 1, text: lines[i].trim() })
          if (matches.length >= maxPerFile) break
        }
      }

      if (matches.length > 0) {
        results.push({ file, matches })
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Sort by number of matches (most relevant first), then by recency
  results.sort((a, b) => b.matches.length - a.matches.length || b.file.mtime.getTime() - a.file.mtime.getTime())
  return results
}

/** Format a match line for display, truncated to width */
export function formatMatchPreview(match: SearchMatch, width: number): string {
  const prefix = `L${match.lineNum}: `
  const maxText = Math.max(10, width - prefix.length)
  const text = match.text.length > maxText
    ? match.text.slice(0, maxText - 1) + '…'
    : match.text
  return prefix + text
}
