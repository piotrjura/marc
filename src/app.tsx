import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import { readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { renderMarkdownWithBlocks, parseFrontmatter } from './lib/render.js'
import { splitIntoSlides, type Slide } from './lib/slides.js'
import { findMatches, highlightLine } from './lib/search-doc.js'
import { scanMarkdownFiles, type FileInfo } from './lib/files.js'
import { FileList, type ListState } from './components/file-list.js'
import { StatusBar } from './components/status-bar.js'
import { scrambleLine, flipDigits } from './lib/animations.js'
import type { BlockRange } from './lib/render.js'

// ── Presentation helpers ──────────────────────────────────

const REVERSE_ON = '\x1b[7m'
const REVERSE_OFF = '\x1b[27m'

/** Highlight focused block with reverse video, show all content. */
function applyFocusHighlight(
  visibleLines: string[],
  blocks: BlockRange[],
  focusIdx: number,
  scrollOffset: number,
): string[] {
  if (focusIdx < 0) return visibleLines
  const block = blocks[focusIdx]
  if (!block) return visibleLines
  return visibleLines.map((line, i) => {
    const absLine = i + scrollOffset
    if (absLine >= block.start && absLine < block.end) {
      return REVERSE_ON + line + REVERSE_OFF
    }
    return line
  })
}

/** Generate a single line of split-flap flip characters. */
function generateFlipLine(width: number): string {
  const chars = ['▄', '▀', '█', '▒', '░', '▓', '▌', '▐']
  let line = ''
  for (let c = 0; c < width; c++) {
    line += chars[Math.floor(Math.random() * chars.length)]
  }
  return '\x1b[2m' + line + '\x1b[22m'
}

/** Pre-render a slide as padded screen lines for transition blending. */
function renderSlideToScreen(slide: Slide, bodyHeight: number, padding: string): string[] {
  const slideHeight = slide.lines.length
  const topPad = slideHeight <= bodyHeight ? Math.floor((bodyHeight - slideHeight) / 2) : 0
  return Array.from({ length: bodyHeight }, (_, i) => {
    const lineIdx = i - topPad
    const content = lineIdx >= 0 && lineIdx < slide.lines.length ? slide.lines[lineIdx] : ''
    return padding + (content || ' ')
  })
}

interface SplitFlapState {
  phase: number
  totalPhases: number
  direction: 'forward' | 'backward'
  oldLines: string[]
  newLines: string[]
}

type Screen =
  | { type: 'list' }
  | { type: 'reader'; fileName: string; absPath: string; content: string }

interface Props {
  initialFile?: { name: string; absPath: string; content: string }
  initialPresentation?: boolean
}

export function App({ initialFile, initialPresentation }: Props) {
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

  // Presentation mode state
  const [presenting, setPresenting] = useState(false)
  const [slideIndex, setSlideIndex] = useState(0)
  const [slideScroll, setSlideScroll] = useState(0)
  const [focusedBlock, setFocusedBlock] = useState(-1)
  const [splitFlap, setSplitFlap] = useState<SplitFlapState | null>(null)

  // Animation: title slide descramble (figlet chars resolve from random after wipe)
  const [descramble, setDescramble] = useState<{ frame: number; totalFrames: number } | null>(null)

  // Animation: split-flap counter in status bar
  const [counterAnim, setCounterAnim] = useState<{ frame: number } | null>(null)

  // Animation: smooth scroll (reader mode)
  const [scrollTarget, setScrollTarget] = useState<number | null>(null)

  // Animation: section wipe (reader mode heading jumps)
  const [sectionWipe, setSectionWipe] = useState<{
    phase: number
    totalPhases: number
    oldLines: string[]
    newScroll: number
  } | null>(null)

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

  // Zen mode: cap content width and center with margins
  const readerWidth = Math.min(Math.floor(dims.cols * 0.7), 100)
  const presentWidth = Math.min(Math.floor(dims.cols * 0.88), 120)
  const activeWidth = presenting ? presentWidth : readerWidth
  const leftPad = Math.max(0, Math.floor((dims.cols - activeWidth) / 2))
  const padding = leftPad > 0 ? ' '.repeat(leftPad) : ''

  // Markdown lines and heading positions for reader (always at reader width)
  const { lines, headings } = useMemo(() => {
    if (screen.type !== 'reader') return { lines: [] as string[], headings: [] as number[] }
    const result = renderMarkdownWithBlocks(screen.content, readerWidth)
    return { lines: result.lines, headings: result.headings }
  }, [screen, readerWidth])

  // Slides for presentation mode
  const slides = useMemo(() => {
    if (screen.type !== 'reader') return [] as Slide[]
    return splitIntoSlides(screen.content, presentWidth)
  }, [screen, presentWidth])

  // Check frontmatter for effects (e.g. effects: descramble)
  const hasDescrambleEffect = useMemo(() => {
    if (screen.type !== 'reader') return false
    const fm = parseFrontmatter(screen.content)
    return (fm.effects ?? '').split(',').map(s => s.trim()).includes('descramble')
  }, [screen])

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

  /** Immediate scroll (no animation). */
  const scrollImmediate = useCallback((n: number) => {
    setScroll(Math.max(0, Math.min(n, Math.max(0, lines.length - bodyHeight))))
    setScrollTarget(null)
  }, [lines.length, bodyHeight])

  /** Smooth scroll — animates for jumps > 3 lines, instant for small moves. */
  const scrollTo = useCallback((n: number) => {
    const clamped = Math.max(0, Math.min(n, Math.max(0, lines.length - bodyHeight)))
    const dist = Math.abs(clamped - scroll)
    if (dist <= 3) {
      setScroll(clamped)
      setScrollTarget(null)
    } else {
      setScrollTarget(clamped)
    }
  }, [lines.length, bodyHeight, scroll])

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

  // Current heading index (last heading at or before top of viewport)
  const currentHeading = useMemo(() => {
    if (headings.length === 0) return -1
    let idx = -1
    for (let i = 0; i < headings.length; i++) {
      if (headings[i] <= scroll) idx = i
    }
    return idx
  }, [headings, scroll])

  const jumpToHeading = useCallback((direction: 1 | -1) => {
    if (headings.length === 0) return
    let target: number
    if (direction === 1) {
      const next = headings.findIndex(h => h > scroll)
      if (next === -1) return
      target = next
    } else {
      let prev = -1
      for (let i = headings.length - 1; i >= 0; i--) {
        if (headings[i] < scroll) { prev = i; break }
      }
      if (prev === -1) return
      target = prev
    }
    const newScroll = Math.max(0, Math.min(headings[target], Math.max(0, lines.length - bodyHeight)))
    const dist = Math.abs(newScroll - scroll)
    // Only wipe for jumps > 5 lines
    if (dist > 5) {
      const oldLines = lines.slice(scroll, scroll + bodyHeight).map(l => padding + (l || ' '))
      setSectionWipe({ phase: 0, totalPhases: 6, oldLines, newScroll })
    } else {
      scrollImmediate(newScroll)
    }
  }, [headings, scroll, lines, bodyHeight, padding, scrollImmediate])

  // ── Presentation mode ─────────────────────────────────────
  const isTitleSlideCheck = useCallback((slide: Slide) => {
    return slide.lines.length > 5 && slide.blocks.length <= 1 && slide.title !== ''
  }, [])

  const enterPresentation = useCallback(() => {
    setPresenting(true)
    setSlideIndex(0)
    setSlideScroll(0)
    setFocusedBlock(-1)
    setSearchMode(false)
    setSearchQuery('')
    // Title slides get descramble entrance (opt-in via frontmatter: effects: descramble)
    const firstSlide = slides[0]
    if (hasDescrambleEffect && firstSlide && isTitleSlideCheck(firstSlide)) {
      setDescramble({ frame: 0, totalFrames: 6 })
    } else {
      setDescramble(null)
    }
    setCounterAnim(null)
  }, [slides, isTitleSlideCheck, hasDescrambleEffect])

  // Auto-enter presentation mode when launched with -p flag
  useEffect(() => {
    if (initialPresentation && slides.length > 0 && !presenting) {
      enterPresentation()
    }
  }, [initialPresentation, slides.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const exitPresentation = useCallback(() => {
    setPresenting(false)
    setFocusedBlock(-1)
    setSlideScroll(0)
    setDescramble(null)
    setCounterAnim(null)
  }, [])

  const currentSlide = slides[slideIndex] as Slide | undefined

  const goToSlide = useCallback((idx: number) => {
    if (idx < 0 || idx >= slides.length) return
    const oldSlide = slides[slideIndex]
    const newSlide = slides[idx]
    if (!oldSlide || !newSlide) return
    const direction = idx > slideIndex ? 'forward' : 'backward'
    const totalPhases = 8

    const oldLines = renderSlideToScreen(oldSlide, bodyHeight, padding)
    const newLines = renderSlideToScreen(newSlide, bodyHeight, padding)
    setSplitFlap({ phase: 0, totalPhases, direction, oldLines, newLines })
    setSlideIndex(idx)
    setSlideScroll(0)
    setFocusedBlock(-1)

    // Title slides get descramble effect after wipe (opt-in via frontmatter)
    if (hasDescrambleEffect && isTitleSlideCheck(newSlide)) {
      setDescramble({ frame: 0, totalFrames: 6 })
    } else {
      setDescramble(null)
    }

    // Counter flip animation
    setCounterAnim({ frame: 0 })
  }, [slides, slideIndex, bodyHeight, padding, isTitleSlideCheck, hasDescrambleEffect])

  // Advance split-flap animation frames
  useEffect(() => {
    if (!splitFlap) return
    if (splitFlap.phase >= splitFlap.totalPhases) {
      setSplitFlap(null)
      return
    }
    const timer = setTimeout(() => {
      setSplitFlap(prev => prev ? { ...prev, phase: prev.phase + 1 } : null)
    }, 40)
    return () => clearTimeout(timer)
  }, [splitFlap])

  // Advance title descramble animation (waits for split-flap to finish)
  useEffect(() => {
    if (!descramble || splitFlap) return
    if (descramble.frame >= descramble.totalFrames) {
      setDescramble(null)
      return
    }
    const timer = setTimeout(() => {
      setDescramble(prev => prev ? { ...prev, frame: prev.frame + 1 } : null)
    }, 50)
    return () => clearTimeout(timer)
  }, [descramble, splitFlap])

  // Advance counter flip animation
  useEffect(() => {
    if (!counterAnim) return
    if (counterAnim.frame >= 4) {
      setCounterAnim(null)
      return
    }
    const timer = setTimeout(() => {
      setCounterAnim(prev => prev ? { ...prev, frame: prev.frame + 1 } : null)
    }, 50)
    return () => clearTimeout(timer)
  }, [counterAnim])

  // Smooth scroll animation (reader mode)
  useEffect(() => {
    if (scrollTarget === null) return
    if (scroll === scrollTarget) {
      setScrollTarget(null)
      return
    }
    const timer = setTimeout(() => {
      const diff = scrollTarget - scroll
      const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) / 3))
      setScroll(s => {
        const next = s + step
        if ((step > 0 && next >= scrollTarget) || (step < 0 && next <= scrollTarget)) return scrollTarget
        return next
      })
    }, 16)
    return () => clearTimeout(timer)
  }, [scroll, scrollTarget])

  // Section wipe animation (reader mode heading jumps)
  useEffect(() => {
    if (!sectionWipe) return
    if (sectionWipe.phase >= sectionWipe.totalPhases) {
      setScroll(sectionWipe.newScroll)
      setSectionWipe(null)
      return
    }
    const timer = setTimeout(() => {
      setSectionWipe(prev => prev ? { ...prev, phase: prev.phase + 1 } : null)
    }, 35)
    return () => clearTimeout(timer)
  }, [sectionWipe])

  // Reader keyboard input
  useInput((input, key) => {
    if (screen.type !== 'reader') return

    // Presentation mode keybindings
    if (presenting) {
      if (key.escape || input === 'p') { setDescramble(null); return exitPresentation() }
      if (input === 'q') return exit()
      if (splitFlap || descramble) return // ignore navigation during transitions
      if ((key.rightArrow || input === ' ' || input === 'l') && slideIndex < slides.length - 1) {
        return goToSlide(slideIndex + 1)
      }
      if ((key.leftArrow || input === 'h') && slideIndex > 0) {
        return goToSlide(slideIndex - 1)
      }
      // Block focus navigation
      if (currentSlide) {
        const blockCount = currentSlide.blocks.length
        if (key.downArrow || input === 'j') {
          if (focusedBlock < blockCount - 1) {
            setFocusedBlock(focusedBlock + 1)
            // Auto-scroll to keep focused block visible
            const block = currentSlide.blocks[focusedBlock + 1]
            const slideHeight = currentSlide.lines.length
            const topPad = slideHeight <= bodyHeight ? Math.floor((bodyHeight - slideHeight) / 2) : 0
            if (topPad === 0 && block) {
              const blockEnd = block.end
              if (blockEnd - slideScroll > bodyHeight) {
                setSlideScroll(Math.min(blockEnd - bodyHeight, slideHeight - bodyHeight))
              }
            }
          }
          return
        }
        if (key.upArrow || input === 'k') {
          if (focusedBlock >= 0) {
            const newFocus = focusedBlock - 1
            setFocusedBlock(newFocus)
            // Auto-scroll to keep focused block visible
            if (newFocus >= 0) {
              const block = currentSlide.blocks[newFocus]
              if (block && block.start < slideScroll) {
                setSlideScroll(block.start)
              }
            } else {
              setSlideScroll(0)
            }
          }
          return
        }
      }
      return
    }

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
    if (sectionWipe) return // ignore navigation during section wipe
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
    if (input === ']') return jumpToHeading(1)
    if (input === '[') return jumpToHeading(-1)
    if (input === 'p') return enterPresentation()
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

  // ── Presentation mode rendering ──────────────────────────
  if (presenting && currentSlide) {
    const slide = currentSlide
    const slideHeight = slide.lines.length
    const topPad = slideHeight <= bodyHeight
      ? Math.floor((bodyHeight - slideHeight) / 2)
      : 0
    const maxSlideScroll = Math.max(0, slideHeight - bodyHeight)
    const clampedScroll = Math.min(slideScroll, maxSlideScroll)
    const visibleSlide = slideHeight <= bodyHeight
      ? slide.lines
      : slide.lines.slice(clampedScroll, clampedScroll + bodyHeight)

    // Reverse-video highlight on focused block
    const highlighted = applyFocusHighlight(visibleSlide, slide.blocks, focusedBlock, clampedScroll)

    // Directional wipe transition (2-line band)
    if (splitFlap) {
      const { phase, totalPhases, direction, oldLines, newLines } = splitFlap
      const bandWidth = 2
      const progress = phase / totalPhases
      const totalDist = bodyHeight + bandWidth

      let bandTop: number
      let aboveBand: string[]
      let belowBand: string[]

      if (direction === 'forward') {
        bandTop = Math.round(bodyHeight - progress * totalDist)
        aboveBand = oldLines
        belowBand = newLines
      } else {
        bandTop = Math.round(-bandWidth + progress * totalDist)
        aboveBand = newLines
        belowBand = oldLines
      }
      const bandBottom = bandTop + bandWidth

      // Counter text for status bar (with flip animation)
      const counterText = `${slideIndex + 1}/${slides.length}`
      const flipText = counterAnim ? flipDigits(counterText, counterAnim.frame / 4) : counterText

      return (
        <Box flexDirection="column" width={dims.cols} height={dims.rows}>
          <Box flexDirection="column" flexGrow={1} height={bodyHeight}>
            {Array.from({ length: bodyHeight }, (_, i) => {
              let line: string
              if (i < bandTop) {
                line = aboveBand[i] || ' '
              } else if (i >= bandBottom) {
                line = belowBand[i] || ' '
              } else {
                line = generateFlipLine(dims.cols)
              }
              return <Text key={i} wrap="truncate">{line}</Text>
            })}
          </Box>
          <StatusBar
            screen="presentation"
            width={dims.cols}
            slideIndex={slideIndex}
            slideCount={slides.length}
            counterText={flipText}
          />
        </Box>
      )
    }

    // Title slide descramble: figlet characters resolve from random
    if (descramble) {
      const progress = descramble.frame / descramble.totalFrames

      return (
        <Box flexDirection="column" width={dims.cols} height={dims.rows}>
          <Box flexDirection="column" flexGrow={1} height={bodyHeight}>
            {Array.from({ length: bodyHeight }, (_, i) => {
              const lineIdx = i - topPad
              const content = lineIdx >= 0 && lineIdx < highlighted.length ? highlighted[lineIdx] : ''
              const line = content || ' '
              const scrambled = line.trim() ? scrambleLine(line, progress) : line
              return <Text key={i} wrap="truncate">{padding}{scrambled}</Text>
            })}
          </Box>
          <StatusBar
            screen="presentation"
            width={dims.cols}
            slideIndex={slideIndex}
            slideCount={slides.length}
            slideTitle={slide.title}
            slideOverflow={slideHeight > bodyHeight}
            counterText={counterAnim ? flipDigits(`${slideIndex + 1}/${slides.length}`, counterAnim.frame / 4) : undefined}
          />
        </Box>
      )
    }

    // Counter text for status bar
    const counterText = counterAnim ? flipDigits(`${slideIndex + 1}/${slides.length}`, counterAnim.frame / 4) : undefined

    return (
      <Box flexDirection="column" width={dims.cols} height={dims.rows}>
        <Box flexDirection="column" flexGrow={1} height={bodyHeight}>
          {Array.from({ length: bodyHeight }, (_, i) => {
            const lineIdx = i - topPad
            const content = lineIdx >= 0 && lineIdx < highlighted.length ? highlighted[lineIdx] : ''
            return <Text key={i} wrap="truncate">{padding}{content || ' '}</Text>
          })}
        </Box>
        <StatusBar
          screen="presentation"
          width={dims.cols}
          slideIndex={slideIndex}
          slideCount={slides.length}
          slideTitle={slide.title}
          slideOverflow={slide.lines.length > bodyHeight}
          counterText={counterText}
        />
      </Box>
    )
  }

  // ── Reader mode ─────────────────────────────────────────

  // Section wipe transition (heading jumps)
  if (sectionWipe) {
    const { phase, totalPhases, oldLines, newScroll } = sectionWipe
    const progress = phase / totalPhases
    const newLines = lines.slice(newScroll, newScroll + bodyHeight).map(l => padding + (l || ' '))
    const bandWidth = 2
    const totalDist = bodyHeight + bandWidth
    const bandTop = Math.round(bodyHeight - progress * totalDist)
    const bandBottom = bandTop + bandWidth

    return (
      <Box flexDirection="column" width={dims.cols} height={dims.rows}>
        <Box flexDirection="column" flexGrow={1} height={bodyHeight}>
          {Array.from({ length: bodyHeight }, (_, i) => {
            let line: string
            if (i < bandTop) {
              line = oldLines[i] || ' '
            } else if (i >= bandBottom) {
              line = newLines[i] || ' '
            } else {
              line = generateFlipLine(dims.cols)
            }
            return <Text key={i} wrap="truncate">{line}</Text>
          })}
        </Box>
        <StatusBar
          screen="reader"
          width={dims.cols}
          fileName={screen.fileName}
          line={newScroll + 1}
          totalLines={lines.length}
          pct={maxScroll > 0 ? Math.round((newScroll / maxScroll) * 100) : 100}
          canGoBack={hasList}
          stale={stale}
          searchMode={searchMode}
          searchQuery={searchQuery}
          matchCount={matchLines.length}
          matchIndex={matchIndex}
          headingIndex={currentHeading}
          headingCount={headings.length}
        />
      </Box>
    )
  }

  const visible = lines.slice(scroll, scroll + bodyHeight)

  // Apply search highlighting to visible lines
  const displayLines = searchQuery
    ? visible.map(line => highlightLine(line, searchQuery))
    : visible

  return (
    <Box flexDirection="column" width={dims.cols} height={dims.rows}>
      <Box flexDirection="column" flexGrow={1} height={bodyHeight}>
        {Array.from({ length: bodyHeight }, (_, i) => (
          <Text key={i} wrap="truncate">{padding}{displayLines[i] || ' '}</Text>
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
        headingIndex={currentHeading}
        headingCount={headings.length}
      />
    </Box>
  )
}
