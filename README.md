# JumpAI — Chrome Extension

> Continue AI conversations across platforms without losing context.

JumpAI injects a floating button on Claude.ai. One click extracts your entire conversation, generates a **structured continuation packet**, copies it to your clipboard, and opens ChatGPT or Gemini in a new tab — ready to pick up exactly where Claude left off.

---

## Screenshot

```
╔════════════════════════════════════════════════════════════╗
║               JUMPAI — CONTINUATION PACKET                ║
╚════════════════════════════════════════════════════════════╝

Continue this conversation exactly where Claude left off.

────────────────────────────────────────────────────────────
OBJECTIVE
────────────────────────────────────────────────────────────
Build a Plasmo Chrome extension with React, TypeScript, and
Tailwind that lets users continue Claude conversations in
ChatGPT or Gemini without losing project continuity.

────────────────────────────────────────────────────────────
CURRENT PROGRESS
...
```

---

## Features

- 🔴 **Floating button** on claude.ai — always accessible
- 🧠 **Smart context extraction** — no AI APIs, pure deterministic logic
- 📋 **Auto clipboard copy** — structured packet ready to paste
- 🚀 **One-click platform jump** — ChatGPT or Gemini opens instantly
- 🎨 **Native aesthetic** — feels at home on Claude's dark UI

---

## Architecture

```
jumpai/
├── contents/
│   └── jumpai.tsx          # Content script — injects the floating UI
├── background/
│   └── index.ts            # Service worker — handles tab opening
├── components/
│   ├── JumpPanel.tsx       # Main floating panel component
│   ├── PlatformButton.tsx  # Platform selection button
│   └── Icons.tsx           # SVG icon components
├── lib/
│   ├── types.ts            # Shared TypeScript types
│   ├── extractor.ts        # Claude DOM extraction logic
│   └── context-generator.ts # Continuation packet generator
├── popup.tsx               # Toolbar popup (non-Claude pages)
├── style.css               # Global styles + Tailwind directives
├── tailwind.config.js
├── postcss.config.js
└── package.json
```

---

## Setup & Development

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Install

```bash
pnpm install
# or
npm install
```

### Development

```bash
pnpm dev
# or
npm run dev
```

Plasmo will:
1. Build the extension to `build/chrome-mv3-dev/`
2. Watch for file changes and hot-reload

### Load in Chrome

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `build/chrome-mv3-dev/` folder

### Production Build

```bash
pnpm build
pnpm package
```

This creates a `.zip` in `build/` ready for the Chrome Web Store.

---

## How It Works

### Extraction (`lib/extractor.ts`)

Uses multiple DOM selector strategies in priority order:

1. **`data-testid` attributes** — most reliable when present
2. **Class-name heuristics** — scans for Human/Assistant class patterns
3. **Prose block analysis** — finds alternating message containers
4. **Full-page fallback** — extracts all visible text

Claude frequently updates its UI — the multi-strategy approach ensures robustness.

### Context Generation (`lib/context-generator.ts`)

Deterministic text analysis — **zero AI APIs, zero backend**:

| Section | Logic |
|---|---|
| OBJECTIVE | Goal-pattern regex on first user messages |
| CURRENT PROGRESS | Completion phrases + bullet points from assistant |
| IMPORTANT CONTEXT | Tech stack, version, constraint mentions |
| FILES / COMPONENTS | File extension regex + PascalCase component names |
| ERRORS / BLOCKERS | Error/exception/stack trace pattern matching |
| ATTEMPTED FIXES | Fix/update/change phrase detection |
| IMPORTANT DECISIONS | Decision/architecture phrase detection |
| NEXT STEP | Next-action phrases from last assistant message |

### Continuation Packet Format

```
╔════════════════════════════════════════════════════════════╗
║               JUMPAI — CONTINUATION PACKET                ║
╚════════════════════════════════════════════════════════════╝

OBJECTIVE
─────────
...

CURRENT PROGRESS
─────────────────
...

IMPORTANT CONTEXT
──────────────────
...

FILES / COMPONENTS DISCUSSED
─────────────────────────────
...

ERRORS OR BLOCKERS
────────────────────
...

ATTEMPTED FIXES
────────────────
...

IMPORTANT DECISIONS
────────────────────
...

NEXT STEP
──────────
...
```

---

## Design Principles

- **No auth** — no accounts, no login
- **No backend** — runs entirely in the browser
- **No AI APIs** — deterministic extraction only
- **No analytics** — zero data collection
- **No subscriptions** — free, forever

---

## Extending JumpAI

### Add a new platform

In `lib/types.ts`, add to the `PLATFORMS` array:

```typescript
{
  id: "perplexity",
  label: "Perplexity",
  url: "https://www.perplexity.ai/",
  icon: "perplexity",
  description: "Perplexity AI"
}
```

Then add its icon in `components/Icons.tsx` and update the icon switch in `components/PlatformButton.tsx`.

### Improve extraction

Edit `lib/extractor.ts` — the strategies are modular. Add new selector strategies to the `TURN_STRATEGIES` array or improve the `heuristicExtract` function.

### Improve context generation

Edit `lib/context-generator.ts` — each section has its own extractor function. Add new regex patterns to the pattern dictionaries at the top of the file.

---

## License

MIT
