import React, { useState, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import type { FileInfo } from '../lib/files.js'
import { formatSize, formatRelativeTime } from '../lib/files.js'
import { searchFileContents, formatMatchPreview, type SearchResult } from '../lib/search.js'

interface FileListProps {
  files: FileInfo[]
  height: number
  width: number
  onSelect: (file: FileInfo, state: ListState) => void
  onQuit: () => void
  initialCursor?: number
  initialPage?: number
  initialSearch?: string
}

export interface ListState {
  cursor: number
  page: number
  search: string
}

type SearchType = 'filename' | 'content'

export function FileList({
  files,
  height,
  width,
  onSelect,
  onQuit,
  initialCursor = 0,
  initialPage = 0,
  initialSearch = '',
}: FileListProps) {
  const [cursor, setCursor] = useState(initialCursor)
  const [page, setPage] = useState(initialPage)
  const [search, setSearch] = useState(initialSearch)
  const [searchMode, setSearchMode] = useState(false)
  const [searchType, setSearchType] = useState<SearchType>('filename')

  // Filename-filtered files
  const filteredFiles = useMemo(() => {
    if (!search || searchType !== 'filename') return files
    const q = search.toLowerCase()
    return files.filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.relPath.toLowerCase().includes(q)
    )
  }, [files, search, searchType])

  // Content search results
  const contentResults = useMemo(() => {
    if (!search || searchType !== 'content') return []
    return searchFileContents(files, search)
  }, [files, search, searchType])

  const isContentSearch = searchType === 'content' && !!search

  // In content search mode, each result takes 2 lines (file + preview)
  const searchVisible = searchMode || !!search
  const linesPerItem = isContentSearch ? 2 : 1
  const pageSize = Math.max(3, Math.floor((height - 4 - (searchVisible ? 2 : 0)) / linesPerItem))

  const displayItems = isContentSearch ? contentResults : filteredFiles
  const totalPages = Math.max(1, Math.ceil(displayItems.length / pageSize))
  const clampedPage = Math.min(page, totalPages - 1)
  const pageItems = displayItems.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize)
  const clamp = (c: number) => Math.max(0, Math.min(pageItems.length - 1, c))

  useInput((input, key) => {
    if (searchMode) {
      if (key.escape) { setSearch(''); setSearchMode(false) }
      else if (key.backspace || key.delete) { setSearch(s => s.slice(0, -1)) }
      else if (key.return) { setSearchMode(false) }
      else if (input && !key.ctrl && !key.meta) {
        setSearch(s => s + input)
        setPage(0)
        setCursor(0)
      }
      return
    }

    if (input === 'q') return onQuit()
    if (input === 'j' || key.downArrow) setCursor(c => clamp(c + 1))
    else if (input === 'k' || key.upArrow) setCursor(c => clamp(c - 1))
    else if (input === '[' || key.pageUp) { setPage(p => Math.max(0, p - 1)); setCursor(0) }
    else if (input === ']' || key.pageDown) { setPage(p => Math.min(totalPages - 1, p + 1)); setCursor(0) }
    else if (input === '/') { setSearchType('filename'); setSearch(''); setSearchMode(true) }
    else if (input === '?') { setSearchType('content'); setSearch(''); setSearchMode(true) }
    else if (key.escape && search) { setSearch(''); setPage(0); setCursor(0) }
    else if (key.return && pageItems.length > 0) {
      const item = pageItems[cursor]
      if (item) {
        const file = isContentSearch ? (item as SearchResult).file : (item as FileInfo)
        onSelect(file, { cursor, page: clampedPage, search })
      }
    }
  })

  const dirName = process.cwd().split('/').pop() ?? '.'
  const resultCount = displayItems.length
  const searchSymbol = searchType === 'content' ? '?' : '/'

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box flexDirection="column" paddingX={2} paddingY={1} flexGrow={1} overflow="hidden">
        {/* Header */}
        <Box marginBottom={1} gap={2}>
          <Text bold color="cyan">marc</Text>
          <Text dimColor>{dirName}</Text>
          <Text dimColor>
            {isContentSearch
              ? `${resultCount} match${resultCount !== 1 ? 'es' : ''}`
              : `${resultCount} file${resultCount !== 1 ? 's' : ''}`
            }
          </Text>
          {totalPages > 1 && (
            <Text dimColor>pg {clampedPage + 1}/{totalPages}</Text>
          )}
        </Box>

        {files.length === 0 && (
          <Text dimColor>No markdown files found.</Text>
        )}

        {displayItems.length === 0 && search && (
          <Text dimColor>No results for "{search}"</Text>
        )}

        {isContentSearch
          ? /* Content search results */
            (pageItems as SearchResult[]).map((result, i) => {
              const isCursor = i === cursor
              const file = result.file
              const preview = formatMatchPreview(result.matches[0], width - 10)
              const matchCount = result.matches.length

              return (
                <Box key={file.relPath} flexDirection="column">
                  <Box>
                    <Text color="cyan">{isCursor ? '› ' : '  '}</Text>
                    {file.dir !== '.' ? (
                      <Text bold={isCursor} wrap="truncate">
                        <Text dimColor>{file.dir}/</Text>
                        <Text color={isCursor ? 'white' : undefined}>{file.name}</Text>
                      </Text>
                    ) : (
                      <Text bold={isCursor} color={isCursor ? 'white' : undefined} wrap="truncate">
                        {file.name}
                      </Text>
                    )}
                    {matchCount > 1 && (
                      <Text dimColor> ({matchCount} matches)</Text>
                    )}
                  </Box>
                  <Box paddingLeft={4}>
                    <Text dimColor wrap="truncate">{preview}</Text>
                  </Box>
                </Box>
              )
            })
          : /* Normal file list */
            (pageItems as FileInfo[]).map((file, i) => {
              const isCursor = i === cursor
              const sizeStr = formatSize(file.size).padStart(8)
              const timeStr = formatRelativeTime(file.mtime).padStart(5)
              const metaWidth = sizeStr.length + timeStr.length + 4
              const pathWidth = Math.max(10, width - 6 - metaWidth)

              return (
                <Box key={file.relPath}>
                  <Text color="cyan">{isCursor ? '› ' : '  '}</Text>
                  <Box width={pathWidth}>
                    {file.dir !== '.' ? (
                      <Text bold={isCursor} wrap="truncate">
                        <Text dimColor>{file.dir}/</Text>
                        <Text color={isCursor ? 'white' : undefined}>{file.name}</Text>
                      </Text>
                    ) : (
                      <Text bold={isCursor} color={isCursor ? 'white' : undefined} wrap="truncate">
                        {file.name}
                      </Text>
                    )}
                  </Box>
                  <Text dimColor>  {sizeStr}  {timeStr}</Text>
                </Box>
              )
            })
        }
      </Box>

      {/* Search bar */}
      {searchVisible && (
        <Box paddingX={2} paddingBottom={1}>
          <Text color="cyan">{searchSymbol} </Text>
          <Text>{search}</Text>
          {searchMode && <Text color="cyan">█</Text>}
          {!searchMode && search && (
            <Text dimColor>  {resultCount} result{resultCount !== 1 ? 's' : ''}  esc to clear</Text>
          )}
        </Box>
      )}
    </Box>
  )
}
