import React from 'react'
import { Box, Text } from 'ink'

interface Hint {
  prefix?: string
  label: string
  keyLen: number
}

function getHints(screen: 'list' | 'reader', canGoBack?: boolean, stale?: boolean): Hint[] {
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
    { label: 'j/k scroll', keyLen: 3 },
    { label: 'd/u page', keyLen: 3 },
    { label: 'g/G top/end', keyLen: 3 },
    { label: 'edit', keyLen: 1 },
    { label: 'reload', keyLen: 1 },
  ]
  if (canGoBack) {
    hints.push({ prefix: 'esc', label: 'back', keyLen: 0 })
  }
  hints.push({ label: 'quit', keyLen: 1 })
  return hints
}

interface StatusBarProps {
  screen: 'list' | 'reader'
  width: number
  // Reader props
  fileName?: string
  line?: number
  totalLines?: number
  canGoBack?: boolean
  stale?: boolean
  // List props
  fileCount?: number
}

export function StatusBar({ screen, width, fileName, line, totalLines, canGoBack, stale, fileCount }: StatusBarProps) {
  const hints = getHints(screen, canGoBack, stale)

  if (screen === 'reader') {
    const pct = totalLines && totalLines > 0 ? Math.min(100, Math.round(((line ?? 1) / totalLines) * 100)) : 100
    const staleTag = stale ? ' [modified]' : ''
    const left = ` ${fileName ?? ''}${staleTag}  ${line ?? 0}/${totalLines ?? 0}  ${pct}%`
    const right = hints.map(h => {
      if (h.prefix) return `${h.prefix} ${h.label}`
      return h.label
    }).join('  ') + ' '
    const gap = Math.max(1, width - left.length - right.length)
    const bar = left + ' '.repeat(gap) + right

    return (
      <Box width={width}>
        <Text inverse>{bar}</Text>
      </Box>
    )
  }

  // List mode — pm-style hint bar
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
