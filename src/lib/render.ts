import { marked } from 'marked'
import chalk from 'chalk'
import { highlight } from 'cli-highlight'
import wrapAnsi from 'wrap-ansi'
import stringWidth from 'string-width'

// ── Public API ─────────────────────────────────────────────────

export function renderMarkdown(source: string, width: number): string[] {
  const effectiveWidth = Math.max(width, 20)
  const clean = stripFrontmatter(source)
  if (!clean.trim()) return ['', chalk.dim('(empty document)'), '']

  const tokens = marked.lexer(clean)
  const blocks = tokens
    .map(t => renderBlock(t, effectiveWidth))
    .filter(b => b.length > 0)

  const lines: string[] = []
  for (const block of blocks) {
    lines.push(...block)
    lines.push('')
  }

  // Trim trailing blanks, keep one for scroll padding
  while (lines.length > 1 && lines[lines.length - 1] === '' && lines[lines.length - 2] === '') {
    lines.pop()
  }

  return lines
}

function stripFrontmatter(source: string): string {
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return match ? source.slice(match[0].length) : source
}

// ── Block-level rendering ──────────────────────────────────────

const HEADING_STYLES = [
  chalk.bold.magenta,  // h1
  chalk.bold.cyan,     // h2
  chalk.bold.green,    // h3
  chalk.bold.yellow,   // h4
  chalk.bold.blue,     // h5
  chalk.bold,          // h6
]

function renderBlock(token: any, width: number): string[] {
  switch (token.type) {
    case 'heading': {
      const text = renderInline(token.tokens ?? [])
      const style = HEADING_STYLES[Math.min(token.depth - 1, 5)]
      const prefix = '#'.repeat(token.depth) + ' '
      const heading = style(prefix + text)
      if (token.depth <= 2) {
        return ['', heading, chalk.dim('─'.repeat(Math.min(width, 60)))]
      }
      return ['', heading]
    }

    case 'paragraph': {
      const text = renderInline(token.tokens ?? [])
      return wrapAnsi(text, width, { hard: true }).split('\n')
    }

    case 'text': {
      if (token.tokens) {
        const text = renderInline(token.tokens)
        return wrapAnsi(text, width, { hard: true }).split('\n')
      }
      return wrapAnsi(token.text ?? token.raw ?? '', width, { hard: true }).split('\n')
    }

    case 'code':
      return renderCodeBlock(token.text, token.lang, width)

    case 'list':
      return renderList(token, width)

    case 'blockquote': {
      const inner = (token.tokens ?? []).flatMap((t: any) => renderBlock(t, width - 4))
      return inner.map((line: string) => chalk.dim('  │ ') + chalk.italic(line))
    }

    case 'hr':
      return [chalk.dim('─'.repeat(width))]

    case 'table':
      return renderTable(token, width)

    case 'html':
      return token.text?.trim() ? [chalk.dim(token.text.trim())] : []

    case 'space':
      return []

    default:
      return token.raw?.trim() ? [token.raw.trim()] : []
  }
}

// ── Code blocks ────────────────────────────────────────────────

function renderCodeBlock(code: string, lang: string | undefined, width: number): string[] {
  let highlighted: string
  try {
    highlighted = highlight(code, { language: lang || undefined, ignoreIllegals: true })
  } catch {
    highlighted = code
  }

  const codeLines = highlighted.split('\n')
  const borderW = Math.max(0, width - 4)
  const result: string[] = []

  // Top border
  if (lang) {
    const dashes = Math.max(0, borderW - lang.length - 3)
    result.push(`  ${chalk.dim('┌')} ${chalk.dim.italic(lang)} ${chalk.dim('─'.repeat(dashes))}`)
  } else {
    result.push(`  ${chalk.dim('┌' + '─'.repeat(borderW))}`)
  }

  // Code lines
  for (const line of codeLines) {
    result.push(`  ${chalk.dim('│')} ${line}`)
  }

  // Bottom border
  result.push(`  ${chalk.dim('└' + '─'.repeat(borderW))}`)

  return result
}

// ── Lists ──────────────────────────────────────────────────────

function renderList(token: any, width: number): string[] {
  const lines: string[] = []
  const items: any[] = token.items ?? []
  const ordered: boolean = token.ordered ?? false
  const start: number = typeof token.start === 'number' ? token.start : 1

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    let bullet: string
    if (item.task) {
      bullet = item.checked ? chalk.green('✓') : chalk.dim('○')
    } else if (ordered) {
      bullet = chalk.dim(`${start + i}.`)
    } else {
      bullet = chalk.dim('•')
    }

    // Separate text/paragraph tokens from nested blocks
    const contentTokens = (item.tokens ?? []).filter(
      (t: any) => t.type === 'text' || t.type === 'paragraph'
    )
    const nestedBlocks = (item.tokens ?? []).filter(
      (t: any) => t.type !== 'text' && t.type !== 'paragraph'
    )

    // Render inline content
    const text = contentTokens
      .map((t: any) => renderInline(t.tokens ?? []))
      .join('\n')

    if (text) {
      const wrapped = wrapAnsi(text, width - 5, { hard: true }).split('\n')
      lines.push(`  ${bullet} ${wrapped[0]}`)
      for (let j = 1; j < wrapped.length; j++) {
        lines.push(`    ${wrapped[j]}`)
      }
    } else {
      lines.push(`  ${bullet}`)
    }

    // Nested blocks (sublists, code blocks, etc.)
    for (const nested of nestedBlocks) {
      const nestedLines = renderBlock(nested, width - 4)
      for (const nl of nestedLines) {
        lines.push(`    ${nl}`)
      }
    }
  }

  return lines
}

// ── Tables ─────────────────────────────────────────────────────

function renderTable(token: any, width: number): string[] {
  const headers: string[] = (token.header ?? []).map((h: any) => renderInline(h.tokens ?? []))
  const aligns: (string | null)[] = token.align ?? []
  const rows: string[][] = (token.rows ?? []).map((row: any[]) =>
    row.map((cell: any) => renderInline(cell.tokens ?? []))
  )

  const colCount = headers.length
  if (colCount === 0) return []

  // Calculate column widths
  const maxColWidth = Math.floor((width - 2) / colCount) - 3
  const colWidths = new Array(colCount).fill(0)
  for (let i = 0; i < colCount; i++) {
    colWidths[i] = stringWidth(headers[i])
    for (const row of rows) {
      colWidths[i] = Math.max(colWidths[i], stringWidth(row[i] ?? ''))
    }
    colWidths[i] = Math.min(colWidths[i], maxColWidth)
  }

  const pad = (text: string, w: number, align: string | null): string => {
    const sw = stringWidth(text)
    const diff = Math.max(0, w - sw)
    if (align === 'center') {
      const left = Math.floor(diff / 2)
      return ' '.repeat(left) + text + ' '.repeat(diff - left)
    }
    if (align === 'right') return ' '.repeat(diff) + text
    return text + ' '.repeat(diff)
  }

  const sep = chalk.dim(' │ ')
  const headerLine = '  ' + headers.map((h, i) => chalk.bold(pad(h, colWidths[i], aligns[i]))).join(sep)
  const divider = '  ' + colWidths.map(w => chalk.dim('─'.repeat(w))).join(chalk.dim('─┼─'))
  const bodyLines = rows.map(row =>
    '  ' + row.map((c, i) => pad(c, colWidths[i], aligns[i])).join(sep)
  )

  return [headerLine, divider, ...bodyLines]
}

// ── Inline rendering ───────────────────────────────────────────

function renderInline(tokens: any[]): string {
  if (!tokens || tokens.length === 0) return ''
  return tokens.map(renderInlineToken).join('')
}

function renderInlineToken(token: any): string {
  switch (token.type) {
    case 'text':
      if (token.tokens) return renderInline(token.tokens)
      return token.text ?? token.raw ?? ''

    case 'strong':
      return chalk.bold(renderInline(token.tokens ?? []))

    case 'em':
      return chalk.italic(renderInline(token.tokens ?? []))

    case 'codespan':
      return chalk.cyan(token.text ?? '')

    case 'link': {
      const text = renderInline(token.tokens ?? [])
      const href = token.href ?? ''
      if (href === text || !href) return chalk.blue.underline(text)
      return chalk.blue.underline(text) + chalk.dim(` (${href})`)
    }

    case 'image':
      return chalk.dim(`[img: ${token.text ?? token.title ?? 'image'}]`)

    case 'br':
      return '\n'

    case 'del':
      return chalk.strikethrough(renderInline(token.tokens ?? []))

    case 'escape':
      return token.text ?? ''

    case 'html':
      return ''

    default:
      return token.raw ?? token.text ?? ''
  }
}
