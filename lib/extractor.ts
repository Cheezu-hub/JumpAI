/**
 * JumpAI V2 — Claude Conversation Extractor
 *
 * Goal: reconstruct the FULL Claude chat thread as an ordered array of
 *   { role: "user" | "assistant", content: string }
 *
 * Strategy (cascading):
 *  1. data-testid selectors  — most reliable, Claude uses them
 *  2. data-role attributes   — some Claude builds expose this
 *  3. Scroll-container walk  — infers role from DOM position / class signals
 *
 * Progressive scrolling recovers lazily-rendered (virtualised) history.
 */

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface RawMessage {
  role: "user" | "assistant"
  content: string            // clean prose + code blocks joined as markdown
}

export interface ExtractionProgress {
  stage: string
  totalFound: number
  userCount: number
  assistantCount: number
  codeBlockCount: number
  durationMs: number
}

export interface ExtractionResult {
  messages: RawMessage[]
  strategy: string
  warnings: string[]
  /** Raw debug string — human-readable dump of what was found */
  debugDump: string
}

// ─── Noise Gate ───────────────────────────────────────────────────────────────
// Short-circuit phrases that are NEVER real conversation content.

const NOISE_PHRASES = new Set([
  "free plan", "pro plan", "team plan", "enterprise plan",
  "upgrade", "upgrade to pro", "upgrade plan", "upgrade now",
  "new chat", "new conversation",
  "recent conversations", "starred conversations",
  "search conversations", "search chats",
  "settings", "sign out", "sign in", "log in", "log out",
  "help", "help center", "documentation",
  "keyboard shortcuts", "shortcuts",
  "projects", "recents", "starred",
  "copy", "edit", "retry", "regenerate", "stop generating",
  "like", "dislike", "thumbs up", "thumbs down",
  "share", "export",
  "model:", "switch model",
  "back", "close", "cancel",
  "send message", "message claude",
  "claude.ai", "anthropic",
])

const NOISE_PATTERNS = [
  /^[\d,]+\s*tokens?$/i,
  /^\d+:\d+\s*(am|pm)?$/i,
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d+/i,
  /^\d+\s*\/\s*\d+$/,
  /^today$|^yesterday$/i,
  /^\$\d+\s*\/\s*(month|mo|yr|year)/i,
]

function isNoise(text: string): boolean {
  const t = text.trim()
  if (t.length < 3) return true
  const lo = t.toLowerCase()
  if (NOISE_PHRASES.has(lo)) return true
  if (NOISE_PATTERNS.some(r => r.test(t))) return true
  // All-uppercase short phrase = UI button label
  if (/^[A-Z\s]{3,20}$/.test(t) && t.split(" ").length <= 3) return true
  return false
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

function isHidden(el: Element): boolean {
  const s = window.getComputedStyle(el)
  return (
    s.display === "none" ||
    s.visibility === "hidden" ||
    s.opacity === "0" ||
    el.getAttribute("aria-hidden") === "true" ||
    (el as HTMLElement).hidden
  )
}

function isInSidebar(el: Element): boolean {
  let cur: Element | null = el
  while (cur && cur !== document.body) {
    const tag = cur.tagName.toLowerCase()
    const cls = (typeof cur.className === "string" ? cur.className : "").toLowerCase()
    const role = (cur.getAttribute("role") || "").toLowerCase()
    if (tag === "nav" || tag === "aside") return true
    if (role === "navigation" || role === "complementary") return true
    if (/sidebar|side-bar|nav-panel|left-panel|drawer|conversation-list/i.test(cls)) return true
    cur = cur.parentElement
  }
  return false
}

/** Extract readable text from a message element. Code blocks → fenced markdown. */
function extractContent(el: Element): string {
  const clone = el.cloneNode(true) as Element

  // Remove buttons, copy icons, hidden elements
  clone.querySelectorAll("button, [role='button'], [aria-hidden='true'], [hidden], svg").forEach(c => c.remove())

  // Convert <pre> blocks to fenced markdown before stripping HTML
  clone.querySelectorAll("pre").forEach(pre => {
    const codeEl = pre.querySelector("code")
    const code = (codeEl || pre).textContent?.trim() || ""
    const cls = (codeEl || pre).className || ""
    const langMatch = cls.match(/language-(\w+)/)
    const lang = langMatch ? langMatch[1] : ""
    const placeholder = document.createTextNode(`\n\`\`\`${lang}\n${code}\n\`\`\`\n`)
    pre.replaceWith(placeholder)
  })

  const raw = (clone as HTMLElement).innerText ?? clone.textContent ?? ""
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/\u200b/g, "")
    .replace(/[ \t]{3,}/g, "  ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
}

function fingerprint(role: string, content: string): string {
  return role + ":" + content.slice(0, 120).replace(/\s+/g, " ").trim()
}

// ─── Scroll Container Detection ───────────────────────────────────────────────

function findScrollContainer(): Element | null {
  // 1. Claude's known virtualized scroller
  const explicit = document.querySelector("div.overflow-y-auto.overflow-x-hidden")
  if (explicit && explicit.scrollHeight > explicit.clientHeight + 50) return explicit

  // 2. Any scrollable container that's not the sidebar, larger than viewport
  const candidates = Array.from(
    document.querySelectorAll("div, main, section, article")
  ).filter(el => {
    if (isInSidebar(el)) return false
    if (isHidden(el)) return false
    const s = window.getComputedStyle(el)
    const overflowY = s.overflowY
    return (
      (overflowY === "auto" || overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight + 50
    )
  })

  // Return the one with the largest scrollable area
  return candidates.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] ?? null
}

// ─── Message Extraction Strategies ───────────────────────────────────────────

interface TaggedEl { el: Element; role: "user" | "assistant" }

/** Strategy 1: data-testid (most reliable for current Claude UI) */
function extractByTestId(): TaggedEl[] {
  const USER_TESTIDS = [
    '[data-testid="human-turn"]',
    '[data-testid="user-turn"]',
    '[data-testid*="human-message"]',
    '[data-testid*="user-message"]',
  ]
  const AI_TESTIDS = [
    '[data-testid="assistant-turn"]',
    '[data-testid="ai-turn"]',
    '[data-testid*="assistant-message"]',
    '[data-testid*="ai-message"]',
  ]

  const userEls = Array.from(document.querySelectorAll(USER_TESTIDS.join(",")))
    .filter(el => !isInSidebar(el) && !isHidden(el))
  const aiEls = Array.from(document.querySelectorAll(AI_TESTIDS.join(",")))
    .filter(el => !isInSidebar(el) && !isHidden(el))

  if (userEls.length + aiEls.length === 0) return []

  return [
    ...userEls.map(el => ({ el, role: "user" as const })),
    ...aiEls.map(el => ({ el, role: "assistant" as const })),
  ]
}

/** Strategy 2: data-role attribute */
function extractByDataRole(): TaggedEl[] {
  const all = Array.from(document.querySelectorAll("[data-role]"))
    .filter(el => !isInSidebar(el) && !isHidden(el))

  const tagged: TaggedEl[] = []
  for (const el of all) {
    const r = el.getAttribute("data-role") || ""
    if (r === "human" || r === "user") tagged.push({ el, role: "user" })
    else if (r === "assistant" || r === "ai" || r === "claude") tagged.push({ el, role: "assistant" })
  }
  return tagged
}

/** Strategy 3: Walk children of the scroll container, infer role from signals. */
function extractFromContainer(container: Element): TaggedEl[] {
  const tagged: TaggedEl[] = []

  // Recursively walk up to 3 levels of children looking for message nodes
  const walk = (parent: Element, depth: number) => {
    if (depth > 4) return
    for (const child of Array.from(parent.children)) {
      if (isHidden(child) || isInSidebar(child)) continue

      const text = child.textContent?.trim() || ""
      if (text.length < 15) continue

      const role = inferRole(child)
      if (role) {
        tagged.push({ el: child, role })
        continue  // don't recurse into identified message nodes
      }
      walk(child, depth + 1)
    }
  }

  walk(container, 0)
  return tagged
}

function inferRole(el: Element): "user" | "assistant" | null {
  const cls = (typeof el.className === "string" ? el.className : "").toLowerCase()
  const testId = (el.getAttribute("data-testid") || "").toLowerCase()
  const role = (el.getAttribute("data-role") || "").toLowerCase()
  const aria = (el.getAttribute("aria-label") || "").toLowerCase()

  if (role === "human" || role === "user") return "user"
  if (role === "assistant" || role === "ai" || role === "claude") return "assistant"
  if (/human|user/.test(testId)) return "user"
  if (/assistant|ai-turn|claude/.test(testId)) return "assistant"
  if (/human message|user message|you said/.test(aria)) return "user"
  if (/assistant|claude.*response|ai response/.test(aria)) return "assistant"
  if (/human-turn|user-turn|user-message|human-message/.test(cls)) return "user"
  if (/assistant|claude-turn|ai-turn|bot-turn|model-turn/.test(cls)) return "assistant"

  // Check nested signals
  if (el.querySelector('[data-testid*="human"], [data-testid*="user"], [data-role="user"], [data-role="human"]')) return "user"
  if (el.querySelector('[data-testid*="assistant"], [data-role="assistant"]')) return "assistant"

  return null
}

// ─── Deduplication & Sorting ─────────────────────────────────────────────────

function sortByDOMOrder(items: TaggedEl[]): TaggedEl[] {
  return [...items].sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el)
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
    return 0
  })
}

function deduplicateTagged(items: TaggedEl[]): TaggedEl[] {
  const deduped: TaggedEl[] = []
  for (const item of items) {
    // Skip if this element is a child/parent of an already-kept element
    const overlaps = deduped.some(
      prev => prev.el.contains(item.el) || item.el.contains(prev.el)
    )
    if (!overlaps) deduped.push(item)
  }
  return deduped
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function extractClaudeConversation(
  onProgress?: (p: ExtractionProgress) => void
): Promise<ExtractionResult> {
  const t0 = performance.now()
  const seen = new Set<string>()
  const allMessages: RawMessage[] = []
  const warnings: string[] = []

  const emit = (stage: string) => {
    if (!onProgress) return
    onProgress({
      stage,
      totalFound: allMessages.length,
      userCount: allMessages.filter(m => m.role === "user").length,
      assistantCount: allMessages.filter(m => m.role === "assistant").length,
      codeBlockCount: allMessages.filter(m => m.content.includes("```")).length,
      durationMs: Math.round(performance.now() - t0),
    })
  }

  const addBatch = (tagged: TaggedEl[]): number => {
    let added = 0
    const sorted = sortByDOMOrder(deduplicateTagged(tagged))
    // Prepend newly discovered older messages
    for (let i = sorted.length - 1; i >= 0; i--) {
      const { el, role } = sorted[i]
      const content = extractContent(el)
      if (!content || content.length < 5) continue
      if (isNoise(content)) continue
      const key = fingerprint(role, content)
      if (!seen.has(key)) {
        seen.add(key)
        allMessages.unshift({ role, content })
        added++
      }
    }
    return added
  }

  // ── Step 1: Detect scroll container ──────────────────────────────────────
  emit("Detecting container")
  const scrollContainer = findScrollContainer()

  console.log("[JumpAI] Container detected:", {
    found: !!scrollContainer,
    class: scrollContainer?.className?.slice?.(0, 80),
    scrollHeight: scrollContainer?.scrollHeight,
  })

  // ── Step 2: Pick strategy & first extraction ──────────────────────────────
  emit("Loading conversation")

  let strategyUsed = "none"

  // Try testid first (most reliable)
  let firstBatch = extractByTestId()
  if (firstBatch.length >= 1) {
    strategyUsed = "testid"
  } else {
    firstBatch = extractByDataRole()
    if (firstBatch.length >= 1) {
      strategyUsed = "data-role"
    } else if (scrollContainer) {
      firstBatch = extractFromContainer(scrollContainer)
      if (firstBatch.length >= 1) strategyUsed = "container-walk"
    }
  }

  console.log("[JumpAI] Strategy selected:", strategyUsed, "| initial batch:", firstBatch.length)

  if (firstBatch.length === 0) {
    warnings.push("Could not find any message elements. Are you on a Claude conversation page?")
    return {
      messages: [],
      strategy: "none",
      warnings,
      debugDump: "MESSAGES FOUND: 0\n\nNo messages could be extracted. Please open a Claude conversation.",
    }
  }

  addBatch(firstBatch)
  emit("Extracting messages")

  // ── Step 3: Progressive scroll upward ────────────────────────────────────
  if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight + 50) {
    let noNewCount = 0
    let attempts = 0

    console.log("[JumpAI] Starting scroll recovery. scrollHeight:", scrollContainer.scrollHeight)

    while (noNewCount < 3 && attempts < 40) {
      attempts++
      const prevTop = scrollContainer.scrollTop

      // Incremental scroll — 1200px steps
      scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - 1200)

      // Wait for React to mount newly virtualised nodes
      await new Promise(r => setTimeout(r, 500))

      // Re-run the winning strategy
      let batch: TaggedEl[] = []
      if (strategyUsed === "testid") batch = extractByTestId()
      else if (strategyUsed === "data-role") batch = extractByDataRole()
      else batch = extractFromContainer(scrollContainer)

      const added = addBatch(batch)

      console.log("[JumpAI] Scroll attempt", attempts, {
        scrollTop: scrollContainer.scrollTop,
        newMessages: added,
        total: allMessages.length,
      })

      emit(`Recovering history (${allMessages.length} found)`)

      if (added === 0) noNewCount++
      else noNewCount = 0

      if (scrollContainer.scrollTop <= 0) {
        console.log("[JumpAI] Reached top of conversation.")
        break
      }

      // Stuck check
      if (scrollContainer.scrollTop === prevTop) noNewCount++
    }

    // Restore scroll position
    scrollContainer.scrollTop = scrollContainer.scrollHeight
    console.log("[JumpAI] Scroll complete. Total messages:", allMessages.length)
  }

  // ── Step 4: Sanity warnings ───────────────────────────────────────────────
  if (allMessages.length === 0) {
    warnings.push("Extraction returned 0 messages — selector may not match current Claude DOM")
  } else if (allMessages.length <= 2) {
    warnings.push("Only 1–2 messages found. Conversation may be incomplete.")
  }

  const userCount = allMessages.filter(m => m.role === "user").length
  const aiCount = allMessages.filter(m => m.role === "assistant").length
  if (allMessages.length > 2 && Math.abs(userCount - aiCount) > 3) {
    warnings.push(`Role imbalance: ${userCount} user vs ${aiCount} assistant — some roles may be wrong`)
  }

  // ── Step 5: Build debug dump ──────────────────────────────────────────────
  const durationSec = ((performance.now() - t0) / 1000).toFixed(1)
  const dumpLines: string[] = [
    `MESSAGES FOUND: ${allMessages.length}`,
    `User: ${userCount}  |  Assistant: ${aiCount}`,
    `Strategy: ${strategyUsed}  |  Time: ${durationSec}s`,
    "",
  ]
  for (const msg of allMessages) {
    dumpLines.push(`[${msg.role.toUpperCase()}]`)
    dumpLines.push(msg.content.slice(0, 400) + (msg.content.length > 400 ? "…" : ""))
    dumpLines.push("")
  }

  emit("Done")

  return {
    messages: allMessages,
    strategy: strategyUsed,
    warnings,
    debugDump: dumpLines.join("\n"),
  }
}

// ─── Legacy shim — still consumed by packet-builder ──────────────────────────

export type ExtractedMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  codeBlocks: { language: string; code: string; filename?: string }[]
  rawLength: number
  index: number
}

export type ExtractionQuality = {
  score: number
  isReliable: boolean
  issues: string[]
}

export function isLikelyNoise(text: string): boolean {
  return isNoise(text)
}

/** Converts the new flat RawMessage[] into the ExtractedMessage[] shape. */
export function toExtractedMessages(raw: RawMessage[]): ExtractedMessage[] {
  return raw.map((m, i) => {
    // Pull code blocks back out so packet-builder can see them
    const codeBlocks: ExtractedMessage["codeBlocks"] = []
    const codeRe = /```(\w*)\n([\s\S]*?)```/g
    let match: RegExpExecArray | null
    while ((match = codeRe.exec(m.content)) !== null) {
      codeBlocks.push({ language: match[1] || "unknown", code: match[2].trim() })
    }
    // Strip code fences from prose
    const prose = m.content.replace(/```[\s\S]*?```/g, "").trim()
    return {
      id: `msg-${i}`,
      role: m.role,
      content: prose,
      codeBlocks,
      rawLength: m.content.length,
      index: i,
    }
  })
}
