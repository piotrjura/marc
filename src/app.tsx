import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import { readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { renderMarkdown } from './lib/render.js'
import { findMatches, highlightLine } from './lib/search-doc.js'
import { scanMarkdownFiles, type FileInfo } from './lib/files.js'
import { FileList, type ListState } from './components/file-list.js'
import { StatusBar } from './components/status-bar.js'

type Screen =
  | { type: 'list' }
  | { type: 'reader'; fileName: string; absPath: string; content: string }

interface Props {
  initialFile?: { name: string; absPath: string; content: string }
}

export function App({ initialFile }: Props) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [dims, setDims] = useState({
    rows: stdout?.rows ?? 24,
    cols: stdout?.columns ?? 80,
  })

  const [screen, setScreen] = useState<Screen>(
    initialFile
      ? { type: 'reader', fileName: initialFile.name, absPath: initialFile.absPath, content: initialFile.content }
      : { type: 'list' }
  )
  const [scroll, setScroll] = useState(0)
  const listStateRef = useRef<ListState>({ cursor: 0, page: 0, search: '', searchType: 'filename' })
  const hasList = !initialFile

  // Search state
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const scrollRef = useRef(0)
  scrollRef.current = scroll
  const pendingJumpRef = useRef(false)

  // Scan files for browser mode
  const files = useMemo(() => {
    if (!hasList) return []
    return scanMarkdownFiles(process.cwd())
  }, [hasList])

  useEffect(() => {
    if (!stdout) return
    const onResize = () => setDims({ rows: stdout.rows, cols: stdout.columns })
    stdout.on('resize', onResize)
    return () => { stdout.off('resize', onResize) }
  }, [stdout])

  // Terminal title
  useEffect(() => {
    const title = screen.type === 'reader'
      ? `marc — ${screen.fileName}`
      : `marc — ${path.basename(process.cwd())}`
    process.stdout.write(`\x1b]2;${title}\x07`)
    return () => { process.stdout.write(`\x1b]2;\x07`) }
  }, [screen])

  const bodyHeight = dims.rows - 1

  // Markdown lines for reader
  const lines = useMemo(() => {
    if (screen.type !== 'reader') return [] as string[]
    return renderMarkdown(screen.content, dims.cols)
  }, [screen, dims.cols])

  const maxScroll = Math.max(0, lines.length - bodyHeight)

  // Search matches
  const matchLines = useMemo(() => findMatches(lines, searchQuery), [lines, searchQuery])

  // Incremental search: jump to nearest match as query changes
  useEffect(() => {
    if (!searchMode || matchLines.length === 0) return
    const cur = scrollRef.current
    let idx = 0
    for (let i = 0; i < matchLines.length; i++) {
      if (matchLines[i] >= cur) { idx = i; break }
    }
    setMatchIndex(idx)
    // Place match ~1/3 from top for comfortable reading
    const target = Math.max(0, matchLines[idx] - Math.floor(bodyHeight / 3))
    const maxS = Math.max(0, lines.length - bodyHeight)
    setScroll(Math.max(0, Math.min(target, maxS)))
  }, [matchLines, searchMode, lines.length, bodyHeight])

  // Jump to first match when opening from content search
  useEffect(() => {
    if (pendingJumpRef.current && matchLines.length > 0) {
      pendingJumpRef.current = false
      setMatchIndex(0)
      const target = Math.max(0, matchLines[0] - Math.floor(bodyHeight / 3))
      const maxS = Math.max(0, lines.length - bodyHeight)
      setScroll(Math.max(0, Math.min(target, maxS)))
    }
  }, [matchLines, lines.length, bodyHeight])

  // Clamp scroll when maxScroll changes (e.g. resize)
  useEffect(() => {
    if (scroll > maxScroll) setScroll(maxScroll)
  }, [maxScroll, scroll])

  const scrollTo = useCallback((n: number) => {
    setScroll(s => Math.max(0, Math.min(n, Math.max(0, lines.length - bodyHeight))))
  }, [lines.length, bodyHeight])

  const openFile = useCallback((file: FileInfo, state: ListState) => {
    listStateRef.current = state
    try {
      const content = readFileSync(file.absPath, 'utf-8')
      setScreen({ type: 'reader', fileName: file.relPath, absPath: file.absPath, content })
      setScroll(0)
      setSearchMode(false)
      // Carry content search query into reader for highlighting + navigation
      if (state.searchType === 'content' && state.search) {
        setSearchQuery(state.search)
        pendingJumpRef.current = true
      } else {
        setSearchQuery('')
      }
    } catch {
      // Can't read file
    }
  }, [])

  const goBack = useCallback(() => {
    setSearchQuery('')
    setSearchMode(false)
    if (hasList) {
      setScreen({ type: 'list' })
      setScroll(0)
    } else {
      exit()
    }
  }, [hasList, exit])

  // Watch open file for external changes
  const [stale, setStale] = useState(false)
  const mtimeRef = useRef<number>(0)

  useEffect(() => {
    if (screen.type !== 'reader') return
    try {
      mtimeRef.current = statSync(screen.absPath).mtimeMs
    } catch { /* */ }
    setStale(false)

    const interval = setInterval(() => {
      try {
        const current = statSync(screen.absPath).mtimeMs
        if (current !== mtimeRef.current) {
          setStale(true)
        }
      } catch { /* */ }
    }, 1000)

    return () => clearInterval(interval)
  }, [screen])

  const reloadFile = useCallback(() => {
    if (screen.type !== 'reader') return
    try {
      const content = readFileSync(screen.absPath, 'utf-8')
      setScreen({ type: 'reader', fileName: screen.fileName, absPath: screen.absPath, content })
      setStale(false)
      mtimeRef.current = statSync(screen.absPath).mtimeMs
    } catch { /* */ }
  }, [screen])

  const openInEditor = useCallback(() => {
    if (screen.type !== 'reader') return
    const editor = process.env.EDITOR || process.env.VISUAL || 'vi'
    spawnSync(editor, [screen.absPath], { stdio: 'inherit' })
    // Reload file content after editor exits
    try {
      const content = readFileSync(screen.absPath, 'utf-8')
      setScreen({ type: 'reader', fileName: screen.fileName, absPath: screen.absPath, content })
    } catch {
      // File may have been deleted
    }
  }, [screen])

  const jumpToMatch = useCallback((idx: number) => {
    if (matchLines.length === 0) return
    setMatchIndex(idx)
    const target = Math.max(0, matchLines[idx] - Math.floor(bodyHeight / 3))
    scrollTo(target)
  }, [matchLines, bodyHeight, scrollTo])

  // Reader keyboard input
  useInput((input, key) => {
    if (screen.type !== 'reader') return

    // Search input mode
    if (searchMode) {
      if (key.escape) { setSearchMode(false); setSearchQuery(''); return }
      if (key.return) {
        setSearchMode(false)
        // Jump to first match if we haven't already
        if (matchLines.length > 0 && matchIndex < matchLines.length) {
          jumpToMatch(matchIndex)
        }
        return
      }
      if (key.backspace || key.delete) { setSearchQuery(q => q.slice(0, -1)); return }
      if (input && !key.ctrl && !key.meta) {
        setSearchQuery(q => q + input)
        return
      }
      return
    }

    // Normal mode
    if (input === 'q') return exit()
    if (key.escape) {
      if (searchQuery) { setSearchQuery(''); return }
      return goBack()
    }
    if (input === '/') { setSearchMode(true); setSearchQuery(''); return }
    if (input === 'n' && searchQuery && matchLines.length > 0) {
      jumpToMatch((matchIndex + 1) % matchLines.length)
      return
    }
    if (input === 'N' && searchQuery && matchLines.length > 0) {
      jumpToMatch((matchIndex - 1 + matchLines.length) % matchLines.length)
      return
    }
    if (input === 'e') return openInEditor()
    if (input === 'r') return reloadFile()
    if (key.downArrow) return scrollTo(scroll + 1)
    if (key.upArrow) return scrollTo(scroll - 1)
    if (key.pageDown) return scrollTo(scroll + Math.floor(bodyHeight / 2))
    if (key.pageUp) return scrollTo(scroll - Math.floor(bodyHeight / 2))
  })

  if (screen.type === 'list') {
    return (
      <Box flexDirection="column" width={dims.cols} height={dims.rows}>
        <FileList
          files={files}
          height={bodyHeight}
          width={dims.cols}
          onSelect={openFile}
          onQuit={() => exit()}
          initialCursor={listStateRef.current.cursor}
          initialPage={listStateRef.current.page}
          initialSearch={listStateRef.current.search}
          initialSearchType={listStateRef.current.searchType}
        />
        <StatusBar
          screen="list"
          width={dims.cols}
          fileCount={files.length}
        />
      </Box>
    )
  }

  // Reader mode
  const visible = lines.slice(scroll, scroll + bodyHeight)

  // Apply search highlighting to visible lines
  const displayLines = searchQuery
    ? visible.map(line => highlightLine(line, searchQuery))
    : visible

  return (
    <Box flexDirection="column" width={dims.cols} height={dims.rows}>
      <Box flexDirection="column" flexGrow={1} height={bodyHeight}>
        {Array.from({ length: bodyHeight }, (_, i) => (
          <Text key={i} wrap="truncate">{displayLines[i] || ' '}</Text>
        ))}
      </Box>
      <StatusBar
        screen="reader"
        width={dims.cols}
        fileName={screen.fileName}
        line={scroll + 1}
        totalLines={lines.length}
        pct={maxScroll > 0 ? Math.round((scroll / maxScroll) * 100) : 100}
        canGoBack={hasList}
        stale={stale}
        searchMode={searchMode}
        searchQuery={searchQuery}
        matchCount={matchLines.length}
        matchIndex={matchIndex}
      />
    </Box>
  )
}
