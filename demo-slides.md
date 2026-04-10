# Marc

A terminal-native slideshow engine

---

# Title Slides

A slide with only a heading becomes a big ASCII art title.

This subtitle text appears dimmed and centered below.

---

# Navigation

**Slide controls:**
- `→` or `Space` or `l` — next slide
- `←` or `h` — previous slide

**Block focus:**
- `↓` or `j` — highlight next block
- `↑` or `k` — move focus back

**Exit:**
- `p` or `Esc` — leave presentation
- `q` — quit marc

---

# Split-Flap Transitions

Every slide change triggers a retro split-flap wipe.

The wipe direction follows navigation: **forward sweeps up**, backward sweeps down.

Watch the status bar — the slide counter digits flip too.

---

# Code Blocks

```python
def greet(name: str) -> str:
    """Generate a greeting."""
    return f"Hello, {name}!"

for person in ["Alice", "Bob", "Charlie"]:
    print(greet(person))
```

> Code blocks get syntax highlighting and a language label.

---

# Multiple Languages

```rust
fn main() {
    let numbers = vec![1, 2, 3, 4, 5];
    let sum: i32 = numbers.iter().sum();
    println!("Sum: {sum}");
}
```

```sql
SELECT users.name, COUNT(orders.id) AS total
FROM users
LEFT JOIN orders ON users.id = orders.user_id
GROUP BY users.name
HAVING total > 5;
```

---

# Tables

| Feature | Status | Since |
|---------|:------:|------:|
| Slide splitting | Done | v0.4.0 |
| Block focus | Done | v0.4.0 |
| Title slides | Done | v0.4.0 |
| Split-flap wipe | Done | v0.4.0 |
| Title descramble | Done | v0.5.0 |
| Counter flip | Done | v0.5.0 |

Tables support left, center, and right alignment.

---

# Inline Formatting

Slides support all standard markdown inline styles:

- **Bold text** for emphasis
- *Italic text* for nuance
- `inline code` for technical terms
- ~~Strikethrough~~ for corrections
- [Links](https://example.com) with URLs
- **Bold and *nested italic*** combined

---

# Blockquotes

> Blockquotes are rendered with a dim vertical bar.
> They're focusable — press ↓ to highlight them.

Regular paragraph between quotes.

> Multi-line blockquotes work too.
> Each line gets the bar prefix.

---

# Unordered Lists

- First item — press ↓ to focus each bullet
- Second item with **bold** and `code`
- Third item
- Fourth item

> Each bullet is independently focusable.

---

# Ordered Lists

1. Step one — plan the presentation
2. Step two — write the markdown
3. Step three — run `marc slides.md`
4. Step four — press `p` to present
5. Step five — impress your audience

---

# Nested Lists

1. Frontend
   - React components
   - CSS modules
   - Client-side routing
2. Backend
   - API routes
   - Database queries
   - Authentication
3. Infrastructure
   - Docker containers
   - CI/CD pipeline

---

# Task Lists

- [x] Create slide engine
- [x] Add split-flap transitions
- [x] Implement block focus
- [x] Build title slides with figlet
- [x] Add animated bullet reveal
- [ ] World domination

---

# Mixed Content

## Heading levels work inside slides

A paragraph of explanation.

- A list of points
- With multiple items

```bash
echo "Code blocks stay visible"
echo "They're not focusable"
```

> But blockquotes are focusable.

---

# Long Title Wrapping

Figlet titles automatically wrap at word boundaries — words are never broken across lines. Try resizing your terminal to see it adapt.

---

# The End

That's everything — press `Esc` or `p` to exit.

Try it on your own markdown files!
