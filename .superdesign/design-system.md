# ML AOS Design System

**Product**: ML AOS (miluo Agent OS)  
**Company**: miluo  
**UI archetype**: Desktop multi-agent workbench (inspired by TabTin team harness layout; NOT a marketing landing page)  
**Primary surface**: Home = three-pane workspace (sidebar · chat timeline · task/HITL panel)

---

## Brand

- **Product name**: ML AOS  
- **Wordmark**: “ML AOS” in top bar left; optional small monogram “ML” in a rounded square  
- **Tone**: Professional, operational, calm density — “agents are working” not “AI magic marketing”  
- **Do not**: purple-indigo SaaS gradients, cream+terracotta editorial, newspaper multi-column, emoji-heavy chrome

---

## Layout (Home)

| Zone | Width feel | Content |
|------|------------|---------|
| Top bar | 48–56px | Logo ML AOS · search · bot status dots · settings |
| Left sidebar | 240–280px | Workspace switcher · topic list · search · New Topic |
| Center | flex 1 | Topic header · message timeline · composer |
| Right panel | 300–340px | Pipeline stages · pending confirmations · cwd / engine |

Desktop viewport target: **1440×900** class.

---

## Color

Inspired by TabTin-style product workspaces (neutral workbench, not landing hero):

| Token | Light | Dark (default prefer) |
|-------|-------|------------------------|
| `--bg-app` | `#F4F5F7` | `#0F1115` |
| `--bg-pane` | `#FFFFFF` | `#161A22` |
| `--bg-elevated` | `#F8F9FB` | `#1C212B` |
| `--border` | `#E5E7EB` | `#2A3140` |
| `--text` | `#111827` | `#E8EAED` |
| `--text-muted` | `#6B7280` | `#9AA3B2` |
| `--accent` | `#2563EB` | `#3B82F6` |
| `--accent-soft` | `#DBEAFE` | `#1E3A5F` |
| `--success` | `#059669` | `#34D399` |
| `--warning` | `#D97706` | `#FBBF24` |
| `--danger` | `#DC2626` | `#F87171` |
| `--bot-ceo` | `#7C3AED` | |
| `--bot-dev` | `#2563EB` | |
| `--bot-test` | `#059669` | |
| `--bot-review` | `#DB2777` | |

**Theme (phase 1):** `dark` | `light` | `system` (follow OS). Default **dark**. Persist in AppSettings. Implement via CSS variables on `:root` / `[data-theme="light"]`; no hardcoded per-page colors. Top bar may include a quick theme toggle; full control lives in App Settings.

---

## Typography

- UI sans: **Geist** or **Inter** for chrome; avoid Inter-only if Geist available  
- Mono for paths, tool calls, cwd: **JetBrains Mono** / **Geist Mono**  
- Topic title: 15–16px semibold  
- Message body: 14px regular, line-height 1.5  
- Sidebar labels: 12–13px  

---

## Components (home)

1. **Topic row**: avatar stack + title + last message preview + status chip (idle / running / needs you)  
2. **Message bubble**: human right-aligned or left with “You”; bots left with role badge + name  
3. **Clarification card** (inline in timeline): title, radio options, Confirm — replaces Feishu card  
4. **Pipeline stepper** (right): Developing → Testing → Reviewing → Done / Blocked  
5. **Composer**: textarea, @ mention chip picker, Send, Abort  

Hairline borders, 8–12px radius on cards; **no** heavy multi-layer shadows. Cards only for interactive HITL/clarification blocks.

---

## Motion

- Stream tokens in message  
- Subtle highlight when right-panel “needs you” increments  
- Soft expand/collapse for tool-call blocks  

Avoid noisy parallax or marketing scroll animations.

---

## Reference intent

- **Structure**: TabTin workspace (group chat + task side + multi-agent)  
- **Density/input**: Cursor / DeepSeek chat craft  
- **Brand**: miluo → product **ML AOS**
