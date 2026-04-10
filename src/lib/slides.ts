import { marked } from 'marked'
import figlet from 'figlet'
import chalk from 'chalk'
import stringWidth from 'string-width'
import wrapAnsi from 'wrap-ansi'
import { stripFrontmatter, renderBlock, renderListWithItems, type BlockRange } from './render.js'

export interface Slide {
  lines: string[]
  blocks: BlockRange[]
  title: string  // first heading text, or empty
}

/**
 * Split markdown source into slides separated by `---` (hr tokens).
 * Each slide is rendered independently at the given width.
 */
export function splitIntoSlides(source: string, width: number): Slide[] {
  const effectiveWidth = Math.max(width, 20)
  const clean = stripFrontmatter(source)
  if (!clean.trim()) return [{ lines: [''], blocks: [], title: '' }]

  const tokens = marked.lexer(clean)

  // Group tokens into slide chunks, splitting on hr
  const tokenGroups: any[][] = []
  let current: any[] = []

  for (const token of tokens) {
    if (token.type === 'hr') {
      if (current.length > 0) {
        tokenGroups.push(current)
        current = []
      }
      continue
    }
    if (token.type === 'space') continue
    current.push(token)
  }
  if (current.length > 0) tokenGroups.push(current)

  // No content at all
  if (tokenGroups.length === 0) {
    return [{ lines: [''], blocks: [], title: '' }]
  }

  // Render each group into a Slide (title slides get big ASCII art)
  return tokenGroups.map(group => {
    if (isTitleSlide(group)) return renderTitleSlide(group, effectiveWidth)
    return renderSlide(group, effectiveWidth)
  })
}

function renderSlide(tokens: any[], width: number): Slide {
  const lines: string[] = []
  const blocks: BlockRange[] = []
  let title = ''

  for (const token of tokens) {
    if (token.type === 'list') {
      const result = renderListWithItems(token, width)
      if (result.lines.length === 0) continue
      const offset = lines.length
      lines.push(...result.lines)
      for (const item of result.itemRanges) {
        blocks.push({ start: offset + item.start, end: offset + item.end })
      }
      lines.push('')
      continue
    }

    const blockLines = renderBlock(token, width)
    if (blockLines.length === 0) continue
    const start = lines.length
    lines.push(...blockLines)
    // Only paragraphs are focusable — skip headings, code, tables, blockquotes, html
    if (token.type === 'paragraph' || token.type === 'blockquote') {
      blocks.push({ start, end: lines.length })
    }
    lines.push('')

    // Capture first heading as slide title
    if (!title && token.type === 'heading') {
      title = token.text ?? ''
    }
  }

  // Trim trailing blanks
  while (lines.length > 1 && lines[lines.length - 1] === '' && lines[lines.length - 2] === '') {
    lines.pop()
  }

  // Trim leading blank lines (headings add a blank before themselves)
  let trimmed = 0
  while (lines.length > 0 && lines[0] === '') {
    lines.shift()
    trimmed++
  }
  if (trimmed > 0) {
    for (const b of blocks) {
      b.start -= trimmed
      b.end -= trimmed
    }
    // Remove blocks that became fully negative
    const valid = blocks.filter(b => b.end > 0)
    // Clamp any that start negative
    for (const b of valid) {
      if (b.start < 0) b.start = 0
    }
    return { lines, blocks: valid, title }
  }

  return { lines, blocks, title }
}

// ── Title slides ──────────────────────────────────────────────

const GRADIENT_START = [192, 132, 252] as const  // #c084fc purple
const GRADIENT_END = [34, 211, 238] as const     // #22d3ee cyan

function lerp(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

/** A title slide has exactly one heading and zero or more paragraphs (subtitle). */
function isTitleSlide(tokens: any[]): boolean {
  const headings = tokens.filter((t: any) => t.type === 'heading')
  const others = tokens.filter((t: any) => t.type !== 'heading' && t.type !== 'paragraph')
  return headings.length === 1 && others.length === 0
}

function centerLine(line: string, width: number): string {
  const w = stringWidth(line)
  if (w >= width) return line
  return ' '.repeat(Math.floor((width - w) / 2)) + line
}

/** Measure the visual width of figlet output (max line length). */
function figletWidth(text: string): number {
  const lines = text.split('\n')
  return Math.max(...lines.map(l => l.length))
}

/** Split title into word groups that each fit within `width` when rendered via figlet. */
function wordWrapFiglet(title: string, width: number): string[][] {
  const words = title.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const groups: string[][] = []
  let current: string[] = []

  for (const word of words) {
    const candidate = [...current, word]
    try {
      const art = figlet.textSync(candidate.join(' '), { font: 'ANSI Shadow' })
      if (figletWidth(art) <= width) {
        current = candidate
      } else if (current.length === 0) {
        // Single word too wide — let figlet break it (no better option)
        groups.push([word])
      } else {
        groups.push(current)
        current = [word]
      }
    } catch {
      if (current.length > 0) groups.push(current)
      current = [word]
    }
  }
  if (current.length > 0) groups.push(current)
  return groups
}

function renderTitleSlide(tokens: any[], width: number): Slide {
  const heading = tokens.find((t: any) => t.type === 'heading')
  const paragraphs = tokens.filter((t: any) => t.type === 'paragraph')
  const title = heading?.text ?? ''

  // Render word groups separately so words are never broken across lines
  const wordGroups = wordWrapFiglet(title, width)
  if (wordGroups.length === 0) return renderSlide(tokens, width)

  let allArtLines: string[] = []
  for (const group of wordGroups) {
    let artText: string
    try {
      artText = figlet.textSync(group.join(' '), { font: 'ANSI Shadow' })
    } catch {
      return renderSlide(tokens, width)
    }
    const groupLines = artText.split('\n')
    // Trim trailing empty lines from each group
    while (groupLines.length > 0 && groupLines[groupLines.length - 1].trim() === '') {
      groupLines.pop()
    }
    allArtLines.push(...groupLines)
  }

  // Apply purple→cyan gradient and center each line
  const lines: string[] = allArtLines.map((line, i) => {
    const t = allArtLines.length > 1 ? i / (allArtLines.length - 1) : 0
    const [r, g, b] = lerp(GRADIENT_START, GRADIENT_END, t)
    return centerLine(chalk.rgb(r, g, b)(line), width)
  })

  // Add subtitle paragraphs (dimmed, centered)
  const blocks: BlockRange[] = []
  if (paragraphs.length > 0) {
    lines.push('')
    for (const p of paragraphs) {
      const text = p.tokens?.map((t: any) => t.raw ?? t.text ?? '').join('') ?? p.text ?? ''
      const wrapped = wrapAnsi(text, Math.min(width, 80), { hard: true }).split('\n')
      const start = lines.length
      for (const wl of wrapped) {
        lines.push(centerLine(chalk.dim(wl), width))
      }
      blocks.push({ start, end: lines.length })
    }
  }

  return { lines, blocks, title }
}
