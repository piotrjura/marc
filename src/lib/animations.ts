// ── Constants ─────────────────────────────────────────────────

export const FLIP_CHARS = ['▄', '▀', '█', '▒', '░', '▓', '▌', '▐']

/** Pick a random flip character. */
export function randomFlipChar(): string {
  return FLIP_CHARS[Math.floor(Math.random() * FLIP_CHARS.length)]
}

// ── Title slide descramble ────────────────────────────────────

/**
 * Scramble non-space characters in a line, preserving ANSI escape sequences.
 * `resolveRatio` 0 = fully scrambled, 1 = fully resolved.
 */
export function scrambleLine(line: string, resolveRatio: number): string {
  if (resolveRatio >= 1) return line
  let result = ''
  let i = 0
  while (i < line.length) {
    // Skip ANSI escape sequences
    if (line[i] === '\x1b' && i + 1 < line.length && line[i + 1] === '[') {
      const end = line.indexOf('m', i)
      if (end !== -1) {
        result += line.slice(i, end + 1)
        i = end + 1
        continue
      }
    }
    const char = line[i]
    if (char !== ' ' && Math.random() > resolveRatio) {
      result += randomFlipChar()
    } else {
      result += char
    }
    i++
  }
  return result
}

// ── Split-flap digit counter ──────────────────────────────────

/**
 * Generate a "flipping" digit string for the slide counter.
 * Returns e.g. "▒3/▓0" during animation.
 */
export function flipDigits(text: string, resolveRatio: number): string {
  if (resolveRatio >= 1) return text
  return text
    .split('')
    .map(ch => {
      if (/\d/.test(ch) && Math.random() > resolveRatio) {
        return randomFlipChar()
      }
      return ch
    })
    .join('')
}
