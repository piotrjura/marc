/**
 * In-document search: find and highlight matches in rendered (ANSI) lines.
 */

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

/** Return indices of rendered lines that contain `query` (case-insensitive). */
export function findMatches(lines: string[], query: string): number[] {
  if (!query) return []
  const q = query.toLowerCase()
  const result: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (stripAnsi(lines[i]).toLowerCase().includes(q)) {
      result.push(i)
    }
  }
  return result
}

/** Highlight all occurrences of `query` in an ANSI string using inverse video. */
export function highlightLine(line: string, query: string): string {
  if (!query) return line
  const plain = stripAnsi(line)
  const lowerPlain = plain.toLowerCase()
  const lowerQuery = query.toLowerCase()

  // Find match positions in the plain (visible) text
  const positions: [number, number][] = []
  let searchPos = 0
  while (searchPos <= lowerPlain.length - lowerQuery.length) {
    const idx = lowerPlain.indexOf(lowerQuery, searchPos)
    if (idx === -1) break
    positions.push([idx, idx + lowerQuery.length])
    searchPos = idx + 1
  }
  if (positions.length === 0) return line

  // Walk the ANSI string, tracking visible-char index.
  // Inject \x1b[7m (inverse on) / \x1b[27m (inverse off) around matches.
  let result = ''
  let visIdx = 0
  let posIdx = 0
  let inHL = false
  let i = 0

  while (i < line.length) {
    // Skip over ANSI escape sequences (CSI: \x1b[ … <letter>)
    if (line[i] === '\x1b' && i + 1 < line.length && line[i + 1] === '[') {
      let j = i + 2
      while (j < line.length && ((line[j] >= '0' && line[j] <= '9') || line[j] === ';')) j++
      if (j < line.length) j++ // consume final letter
      result += line.slice(i, j)
      i = j
      continue
    }

    // Start highlight?
    if (!inHL && posIdx < positions.length && visIdx === positions[posIdx][0]) {
      result += '\x1b[7m'
      inHL = true
    }

    result += line[i]
    visIdx++
    i++

    // End highlight?
    if (inHL && posIdx < positions.length && visIdx === positions[posIdx][1]) {
      result += '\x1b[27m'
      inHL = false
      posIdx++
    }
  }

  if (inHL) result += '\x1b[27m'
  return result
}
