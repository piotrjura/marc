import React from 'react'
import { Box, Text } from 'ink'

interface Hint {
  prefix?: string
  label: string
  keyLen: number
}

function getHints(screen: 'list' | 'reader', canGoBack?: boolean, searching?: boolean): Hint[] {
  if (screen === 'list') {
    return [
      { prefix: '↑↓', label: 'navigate', keyLen: 0 },
      { prefix: '⏎', label: 'open', keyLen: 0 },
      { label: '/search', keyLen: 1 },
      { label: '?content', keyLen: 1 },
      { label: '[]page', keyLen: 2 },
      { label: 'quit', keyLen: 1 },
    ]
  }
  // Reader
  const hints: Hint[] = [
    { prefix: '↑↓', label: 'scroll', keyLen: 0 },
    { prefix: 'PgUp/Dn', label: 'page', keyLen: 0 },
  ]
  if (searching) {
    hints.push({ label: 'n/N match', keyLen: 3 })
  } else {
    hints.push({ label: '/search', keyLen: 1 })
    hints.push({ prefix: '[]', label: 'section', keyLen: 0 })
    hints.push({ label: 'ppresent', keyLen: 1 })
    hints.push({ label: 'eedit', keyLen: 1 })
    hints.push({ label: 'rreload', keyLen: 1 })
  }
  if (searching) {
    hints.push({ prefix: 'esc', label: 'clear', keyLen: 0 })
  } else if (canGoBack) {
    hints.push({ prefix: 'esc', label: 'back', keyLen: 0 })
  }
  hints.push({ label: 'qquit', keyLen: 1 })
  return hints
}

interface StatusBarProps {
  screen: 'list' | 'reader' | 'presentation'
  width: number
  // Reader props
  fileName?: string
  line?: number
  totalLines?: number
  pct?: number
  canGoBack?: boolean
  stale?: boolean
  // List props
  fileCount?: number
  // Search props
  searchMode?: boolean
  searchQuery?: string
  matchCount?: number
  matchIndex?: number
  // Heading navigation
  headingIndex?: number
  headingCount?: number
  // Presentation props
  slideIndex?: number
  slideCount?: number
  slideTitle?: string
  slideOverflow?: boolean
}

export function StatusBar({ screen, width, fileName, line, totalLines, pct: pctProp, canGoBack, stale, fileCount, searchMode, searchQuery, matchCount, matchIndex, headingIndex, headingCount, slideIndex, slideCount, slideTitle, slideOverflow }: StatusBarProps) {
  if (screen === 'presentation') {
    const idx = (slideIndex ?? 0) + 1
    const total = slideCount ?? 0
    const title = slideTitle ? `  ${slideTitle}` : ''
    const left = ` Slide ${idx}/${total}${title}`
    const right = slideOverflow
      ? '← → slide  ↑↓ focus/scroll  p exit '
      : '← → slide  ↑↓ focus  p exit '
    const gap = Math.max(1, width - left.length - right.length)
    const bar = left + ' '.repeat(gap) + right

    return (
      <Box width={width}>
        <Text dimColor>{bar}</Text>
      </Box>
    )
  }

  if (screen === 'reader') {
    // Search input mode — replace entire bar with search prompt
    if (searchMode) {
      const prompt = ` /${searchQuery ?? ''}`
      const cursor = '█'
      const mc = matchCount ?? 0
      const info = searchQuery
        ? mc > 0
          ? `${mc} match${mc !== 1 ? 'es' : ''} `
          : 'no matches '
        : ''
      const used = prompt.length + 1 + info.length
      const gap = Math.max(0, width - used)

      return (
        <Box width={width}>
          <Text dimColor>{prompt}</Text>
          <Text>{'█'}</Text>
          <Text>{' '.repeat(gap)}</Text>
          <Text dimColor>{info}</Text>
        </Box>
      )
    }

    const pct = pctProp ?? 100
    const staleTag = stale ? ' [modified]' : ''
    const searching = !!searchQuery
    const hints = getHints(screen, canGoBack, searching)
    // Compact: show only key shortcuts, drop descriptions
    const keys = hints.map(h => {
      if (h.prefix) return h.prefix
      return h.keyLen > 0 ? h.label.slice(0, h.keyLen) : h.label.charAt(0)
    }).join('  ')
    const matchInfo = searching && (matchCount ?? 0) > 0
      ? `  [${(matchIndex ?? 0) + 1}/${matchCount}]`
      : ''
    const hIdx = headingIndex ?? -1
    const hCount = headingCount ?? 0
    const sectionInfo = hCount > 0
      ? `  §${hIdx >= 0 ? hIdx + 1 : '-'}/${hCount}`
      : ''
    const left = ` ${fileName ?? ''}${staleTag}  ${line ?? 0}/${totalLines ?? 0}  ${pct}%${matchInfo}${sectionInfo}`
    const right = keys + ' '
    const gap = Math.max(1, width - left.length - right.length)
    const bar = left + ' '.repeat(gap) + right

    return (
      <Box width={width}>
        <Text dimColor>{bar}</Text>
      </Box>
    )
  }

  // List mode — pm-style hint bar
  const hints = getHints(screen)
  return (
    <Box paddingX={2} gap={2}>
      <Text dimColor>──</Text>
      {hints.map((hint, i) => (
        <Text key={i}>
          {hint.prefix && (
            <>
              <Text bold color="cyan">{hint.prefix}</Text>
              <Text> </Text>
            </>
          )}
          {hint.keyLen > 0 ? (
            <>
              <Text bold color="white">{hint.label.slice(0, hint.keyLen)}</Text>
              <Text dimColor>{hint.label.slice(hint.keyLen)}</Text>
            </>
          ) : (
            <Text dimColor>{hint.label}</Text>
          )}
        </Text>
      ))}
    </Box>
  )
}
