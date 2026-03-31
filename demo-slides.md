# Marc Presentation Mode

A **terminal-native** slideshow engine

- Write slides in markdown
- Separate with `---`
- Present with `p`

---

# Navigation

**Slide controls:**
- Left / Right arrows to switch slides
- Space also advances

**Focus controls:**
- Down arrow highlights the next block
- Up arrow moves back
- Non-focused content dims automatically

---

# Code Looks Great

```javascript
function fibonacci(n) {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}

console.log(fibonacci(10)) // 55
```

> Syntax highlighting works out of the box

---

# Tables Too

| Shortcut | Action |
|----------|--------|
| `p` | Enter presentation |
| `→` / `Space` | Next slide |
| `←` | Previous slide |
| `↓` / `↑` | Focus blocks |
| `Esc` | Exit presentation |

---

# Bullet Points

Things you can put on a slide:

- Headings and paragraphs
- **Bold**, *italic*, and `inline code`
- Ordered and unordered lists
- Code blocks with syntax highlighting
- Tables with alignment
- Blockquotes

> Everything markdown supports, rendered beautifully in your terminal.

---

# Nested Lists

1. First major point
   - Supporting detail A
   - Supporting detail B
2. Second major point
   - Another sub-point
3. Third major point

---

# The End

That's the demo — press `Esc` or `p` to exit.

Try it on your own markdown files!
