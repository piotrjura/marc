import { marked } from 'marked'
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

  // Render each group into a Slide
  return tokenGroups.map(group => renderSlide(group, effectiveWidth))
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
    blocks.push({ start, end: lines.length })
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
