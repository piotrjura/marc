# Marc — Markdown Reader

A terminal-based markdown viewer with **syntax highlighting** and *vim-like* navigation.

## Features

- Full markdown rendering in your terminal
- **Syntax highlighted** code blocks
- Vim-style scrolling (`j/k`, `d/u`, `g/G`)
- Tables, blockquotes, lists — all handled
- Responsive to terminal resizing

## Code Example

Here's some TypeScript:

```typescript
interface User {
  name: string
  age: number
  email?: string
}

function greet(user: User): string {
  const greeting = `Hello, ${user.name}!`
  if (user.age >= 18) {
    return `${greeting} Welcome aboard.`
  }
  return `${greeting} You're ${user.age} years old.`
}

const users: User[] = [
  { name: 'Alice', age: 30, email: 'alice@example.com' },
  { name: 'Bob', age: 17 },
]

users.forEach(u => console.log(greet(u)))
```

And some Python:

```python
from dataclasses import dataclass
from typing import Optional

@dataclass
class Config:
    host: str = "localhost"
    port: int = 8080
    debug: bool = False

def start_server(config: Optional[Config] = None):
    cfg = config or Config()
    print(f"Starting server on {cfg.host}:{cfg.port}")
    if cfg.debug:
        print("Debug mode enabled")
```

A shell script:

```bash
#!/bin/bash
set -euo pipefail

echo "Building project..."
npm run build
echo "Running tests..."
npm test
echo "Done!"
```

## Table Example

| Feature | Status | Notes |
|---------|--------|-------|
| Headings | Done | H1-H6 with colors |
| Code blocks | Done | Syntax highlighted |
| Lists | Done | Ordered, unordered, tasks |
| Tables | Done | With alignment |
| Blockquotes | Done | Nested support |

## Blockquote

> This is a blockquote. It can contain **bold** and *italic* text.
>
> It can also span multiple paragraphs.

## Lists

### Unordered

- First item with some text
- Second item that is **bold**
- Third item with `inline code`
  - Nested item one
  - Nested item two

### Ordered

1. Step one: install dependencies
2. Step two: configure the project
3. Step three: run the build

### Task List

- [x] Set up project structure
- [x] Implement markdown parser
- [x] Add syntax highlighting
- [ ] Add search functionality
- [ ] Support piped stdin input

---

## Links & Inline Elements

Check out [GitHub](https://github.com) for code hosting.

Use `npm install` to install dependencies. The `--save-dev` flag adds them as dev dependencies.

This text has **bold**, *italic*, ~~strikethrough~~, and `code` elements mixed together.

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

---

That's it! This is a test document for the `marc` markdown reader.
