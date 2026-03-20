import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import { readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { renderMarkdown } from './lib/render.js'
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
  const listStateRef = useRef<ListState>({ cursor: 0, page: 0, search: '' })
  const hasList = !initialFile

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
    if (screen.type !== 'reader') return []
    return renderMarkdown(screen.content, dims.cols)
  }, [screen, dims.cols])

  const maxScroll = Math.max(0, lines.length - bodyHeight)

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
    } catch {
      // Can't read file
    }
  }, [])

  const goBack = useCallback(() => {
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

  // Reader keyboard input
  useInput((input, key) => {
    if (screen.type !== 'reader') return

    if (input === 'q') return exit()
    if (key.escape) return goBack()
    if (input === 'e') return openInEditor()
    if (input === 'r') return reloadFile()
    if (input === 'j' || key.downArrow) return scrollTo(scroll + 1)
    if (input === 'k' || key.upArrow) return scrollTo(scroll - 1)
    if (input === 'd' || key.pageDown) return scrollTo(scroll + Math.floor(bodyHeight / 2))
    if (input === 'u' || key.pageUp) return scrollTo(scroll - Math.floor(bodyHeight / 2))
    if (input === 'g') return scrollTo(0)
    if (input === 'G') return scrollTo(maxScroll)
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

  return (
    <Box flexDirection="column" width={dims.cols} height={dims.rows}>
      <Box flexDirection="column" flexGrow={1} height={bodyHeight}>
        {Array.from({ length: bodyHeight }, (_, i) => (
          <Text key={i} wrap="truncate">{visible[i] || ' '}</Text>
        ))}
      </Box>
      <StatusBar
        screen="reader"
        width={dims.cols}
        fileName={screen.fileName}
        line={scroll + 1}
        totalLines={lines.length}
        canGoBack={hasList}
        stale={stale}
      />
    </Box>
  )
}
