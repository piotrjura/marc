# marc

### Demo

https://github.com/user-attachments/assets/912e9c99-e0d0-430f-9bf4-bdadeb31814f

A terminal markdown reader. Browse, search, and read markdown files without leaving the terminal.

Built with React (Ink) for a vim-like keyboard-driven experience with full markdown rendering — headings, code blocks with syntax highlighting, tables, lists, blockquotes, and inline formatting.

## Install

```bash
npm install -g @piotrjura/marc
```

Or run without installing:

```bash
npx @piotrjura/marc
```

## Usage

### Browse files

```bash
marc
```

Opens a fullscreen file browser showing all `.md` and `.mdx` files in the current directory (recursive). Files are sorted by modification time, newest first.

### Open a specific file

```bash
marc docs/setup.md
```

Opens the file directly in the reader.

### Search inside files

```bash
marc search "deployment"
```

Searches file contents (case-insensitive substring match). Prints matching files with line numbers and context. Pipe-friendly — works with `grep`, `head`, `less`, etc.

Output format:

```
docs/setup.md
  L12: Run the deployment script before pushing to production
  L45: The deployment pipeline handles migrations automatically
notes/meeting-notes.md
  L8: Decided to switch deployment to Railway
```

## TUI keybindings

### File browser

| Key | Action |
|-----|--------|
| `j` / `↓` | Navigate down |
| `k` / `↑` | Navigate up |
| `Enter` | Open file |
| `/` | Search by filename |
| `?` | Search inside file contents |
| `[` / `]` | Previous / next page |
| `Esc` | Clear search |
| `q` | Quit |

### Reader

| Key | Action |
|-----|--------|
| `↑` / `↓` | Scroll up / down |
| `Page Up` / `Page Down` | Half page up / down |
| `/` | Search in document |
| `n` / `N` | Next / previous match |
| `e` | Open in `$EDITOR` |
| `r` | Reload file |
| `p` | Enter presentation mode |
| `[` / `]` | Previous / next heading |
| `Esc` | Clear search / back to file list |
| `q` | Quit |

### Presentation mode

| Key | Action |
|-----|--------|
| `→` / `Space` / `l` | Next slide |
| `←` / `h` | Previous slide |
| `↓` / `j` | Highlight next block |
| `↑` / `k` | Highlight previous block |
| `Esc` / `p` | Exit presentation |
| `q` | Quit |

## Features

**Markdown rendering** — headings (H1–H6) with color coding, fenced code blocks with syntax highlighting (30+ languages), tables with alignment, ordered/unordered/task lists, blockquotes, bold/italic/strikethrough/code inline formatting, links with URLs.

**File browser** — recursive scanning with smart directory filtering (skips `node_modules`, `.git`, `dist`, `build`, etc.), pagination, filename search, file size and relative modification time display.

**Content search** — full-text substring search across all files. In the TUI (`?`), results show the filename with a preview of the first matching line. Opening a result auto-jumps to the first occurrence and highlights all matches — use `n`/`N` to navigate between them. On the CLI (`marc search`), results include up to 3 matching lines per file.

**External edit detection** — when reading a file, marc watches for external changes (1s polling). If the file is modified (by an editor, Claude Code, or any other process), `[modified]` appears in the status bar. Press `r` to reload.

**Editor integration** — press `e` to open the current file in `$EDITOR` (falls back to `vi`). Marc reloads the file automatically when the editor exits.

**Presentation mode** — press `p` in the reader to present markdown as slides. Slides are separated by `---` (horizontal rules). Content is centered at 88% terminal width. Navigate slides with arrow keys or `h`/`l`. Use `↓`/`↑` to step through blocks (headings, paragraphs, individual bullets) — the focused block is highlighted with reverse video. Slide transitions use a split-flap wipe effect that sweeps directionally (up for next, down for previous). Files without `---` separators display as a single slide.

## How it works

Marc has two modes sharing one codebase:

1. **CLI commands** (`marc search`) — run, print results, exit. Scriptable and pipe-friendly.
2. **Fullscreen TUI** (`marc` or `marc <file>`) — interactive React app rendered in an alternate screen buffer via Ink.

File scanning (`lib/files.ts`) walks the directory tree, skipping known build/cache directories. Content search (`lib/search.ts`) reads files on demand — no index, no cache, no background process. For typical note collections (hundreds to low thousands of files), this is instant.

The reader (`lib/render.ts`) tokenizes markdown via Marked and renders each token to styled terminal lines with proper wrapping, indentation, and ANSI colors.

## Project structure

```
src/
├── cli.tsx                  # Entry point: subcommands + TUI launch
├── app.tsx                  # Root component: navigation, file watching, keybindings
├── components/
│   ├── file-list.tsx        # File browser with pagination + dual search modes
│   └── status-bar.tsx       # Context-aware footer with keybinding hints
└── lib/
    ├── files.ts             # File scanning, filtering, formatting
    ├── search.ts            # Content search (substring match)
    ├── search-doc.ts        # In-document search + highlighting
    ├── slides.ts            # Markdown → slide splitting + rendering
    └── render.ts            # Markdown → styled terminal lines
```

## Development

```bash
npm run dev          # Run with tsx (no build step)
npm run build        # Build with tsup (ESM + shebang)
npm test             # Run tests (vitest)
```

## Changelog

### 0.4.0

- **Presentation mode** — press `p` in the reader to present markdown as a slideshow. `---` separators split slides. Centered layout, directional split-flap wipe transitions, block-level focus with reverse-video highlight.
- **Heading navigation** — `[`/`]` to jump between headings in the reader.
- **Slide block focus** — `↓`/`↑` steps through headings, paragraphs, and individual bullets with reverse-video highlighting.

### 0.3.0

- **Content search → reader integration** — opening a file from `?` content search now auto-jumps to the first match and highlights all occurrences. `n`/`N` navigation works immediately.
- **Back navigation preserves search** — returning from a document to the file list now restores content search results instead of showing "no items".
- **In-document search** (`/`) — incremental search with real-time highlighting and match counter.
- **Scroll percentage** in the reader status bar.
- **Block-level rendering infrastructure** — markdown blocks (headings, code, list items) are now tracked with line ranges, enabling future block navigation.
- **Simplified reader keybindings** — arrow keys and Page Up/Down for scrolling (removed vim-style j/k/d/u/g/G).
- **Compact status bar** — dimmed, less noisy hint display.

### 0.2.0

- In-document search with highlighting.
- Dimmed reader status bar.

### 0.1.0

- Initial release — file browser, reader, CLI search, syntax highlighting, external edit detection.
