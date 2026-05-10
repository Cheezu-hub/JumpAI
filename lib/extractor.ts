/**
 * JumpAI V2 — Robust Claude Conversation Extractor
 *
 * Strategy:
 * 1. Locate the conversation scroll container (NOT the sidebar or nav)
 * 2. Find message turn containers using multiple selector strategies
 * 3. Determine role from DOM signals (data attrs, class names, position)
 * 4. Extract clean text + code blocks from each message
 * 5. Aggressively filter UI noise
 * 6. Validate extraction quality
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedMessage {
  id: string
  role: "user" | "assistant"
  content: string          // Clean prose text (no code blocks)
  codeBlocks: CodeBlock[]
  rawLength: number        // Original character count before cleaning
  index: number
}

export interface CodeBlock {
  language: string
  code: string
  filename?: string
}

export interface ExtractionResult {
  messages: ExtractedMessage[]
  strategy: string          // Which strategy worked
  quality: ExtractionQuality
  warnings: string[]
}

export interface ExtractionQuality {
  score: number             // 0–100
  isReliable: boolean
  issues: string[]
}

export interface ExtractionProgress {
  totalFound: number
  userCount: number
  assistantCount: number
  codeBlockCount: number
  durationMs: number
}

// ─── UI Noise Vocabulary ──────────────────────────────────────────────────────
// These are exact strings / fragments that indicate Claude UI chrome, not conversation.

const UI_NOISE_EXACT = new Set([
  "free plan", "pro plan", "team plan", "enterprise",
  "upgrade", "upgrade to pro", "upgrade plan",
  "new chat", "new conversation",
  "recent conversations", "starred conversations",
  "search conversations", "search chats",
  "claude.ai", "anthropic",
  "settings", "sign out", "sign in", "log in", "log out",
  "help", "help center", "documentation",
  "keyboard shortcuts", "shortcuts",
  "projects", "recents", "starred",
  "send", "attach", "attach file", "upload",
  "copy", "edit", "retry", "regenerate",
  "like", "dislike", "thumbs up", "thumbs down",
  "share", "export",
  "reply", "continue", "cancel", "stop generating",
  "claude", // standalone "claude" label in header
  "claude 3", "claude 3.5", "claude opus", "claude sonnet", "claude haiku",
  "model:", "switch model",
  "chat", "chats",
  "back", "close",
])

const UI_NOISE_PREFIXES = [
  "press ",
  "use ",
  "click ",
  "type ",
  "ctrl+",
  "cmd+",
  "alt+",
  "shift+",
  "⌘",
  "⌥",
  "↩",
  "you're on the",
  "you are on the",
  "started on",
  "today,",
  "yesterday,",
  "last week",
  "view all",
  "see all",
  "load more",
  "showing ",
  "page ",
]

const UI_NOISE_PATTERNS = [
  /^\d+\s*\/\s*\d+$/,              // "3 / 10" pagination
  /^[\d,]+ tokens?$/i,             // "1,234 tokens"
  /^message \d+ of \d+$/i,         // "Message 1 of 5"
  /^\d+:\d+\s*(am|pm)?$/i,         // Timestamps like "3:45 PM"
  /^today$|^yesterday$/i,
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d+/i,
  /^[a-z]\s*[-–]\s*[a-z]/i,       // Single letter navigation labels
]

/**
 * Returns true if text is likely UI chrome, not conversation content.
 */
export function isLikelyNoise(text: string): boolean {
  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()

  // Empty or extremely short
  if (trimmed.length < 3) return true

  // Very short with no meaningful content (< 25 chars, not a code line)
  if (trimmed.length < 25 && !trimmed.includes("\n") && !/[{};()=]/.test(trimmed)) {
    // Allow short tech terms, error codes, filenames
    if (!/\.(tsx?|jsx?|py|go|rs|md|json|yaml|css|html|sh)$/.test(lower) &&
        !/^[A-Z_]{2,}$/.test(trimmed) && // Constants like ENV_VAR
        !/error|warning|failed|success/i.test(trimmed)) {
      // Check if it's a UI phrase
      if (UI_NOISE_EXACT.has(lower)) return true
      if (UI_NOISE_PATTERNS.some(p => p.test(trimmed))) return true
      // If it's very short and not code-like, likely UI
      if (trimmed.length < 15) return true
    }
  }

  // Exact UI phrase match
  if (UI_NOISE_EXACT.has(lower)) return true

  // Prefix match
  if (UI_NOISE_PREFIXES.some(p => lower.startsWith(p))) return true

  // Pattern match
  if (UI_NOISE_PATTERNS.some(p => p.test(trimmed))) return true

  // Detect pricing UI: "Free Plan", "Pro $X/month", etc.
  if (/(?:free|pro|team|enterprise)\s+(?:plan|tier)/i.test(trimmed)) return true
  if (/\$\d+\s*\/\s*(?:month|mo|yr|year)/i.test(trimmed)) return true

  // Navigation-like: all caps short phrase (UI buttons)
  if (/^[A-Z\s]{3,20}$/.test(trimmed) && trimmed.split(" ").length <= 3) return true

  return false
}

// ─── DOM Utilities ────────────────────────────────────────────────────────────

/**
 * Returns true if an element is visually hidden or not in the conversation area.
 */
function isHiddenElement(el: Element): boolean {
  const style = window.getComputedStyle(el)
  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0" ||
    el.getAttribute("aria-hidden") === "true" ||
    (el as HTMLElement).hidden
  )
}

/**
 * Returns true if element is inside the sidebar or navigation areas.
 */
function isInSidebarOrNav(el: Element): boolean {
  let current: Element | null = el
  while (current && current !== document.body) {
    const tag = current.tagName.toLowerCase()
    const role = current.getAttribute("role") || ""
    const cls = current.className || ""
    const id = current.id || ""

    if (tag === "nav" || tag === "aside") return true
    if (role === "navigation" || role === "complementary") return true

    // Common Claude sidebar class fragments
    if (typeof cls === "string" && (
      /sidebar|side-bar|nav-panel|left-panel|drawer|conversation-list|chat-list/i.test(cls) ||
      /sidebar|side-bar|nav-panel|left-panel|drawer|conversation-list|chat-list/i.test(id)
    )) return true

    current = current.parentElement
  }
  return false
}

/**
 * Extract clean text from an element, excluding code blocks (handled separately).
 */
function extractProseText(el: Element): string {
  // Clone so we can modify without affecting the page
  const clone = el.cloneNode(true) as Element

  // Remove code blocks from prose extraction
  clone.querySelectorAll("pre, code").forEach(c => c.remove())

  // Remove hidden elements
  clone.querySelectorAll("[aria-hidden='true'], [hidden]").forEach(c => c.remove())

  // Remove button-like elements
  clone.querySelectorAll("button, [role='button']").forEach(c => c.remove())

  const raw = (clone as HTMLElement).innerText || clone.textContent || ""
  return cleanText(raw)
}

/**
 * Extract code blocks from a message element.
 */
function extractCodeBlocks(el: Element): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const pres = el.querySelectorAll("pre")

  pres.forEach(pre => {
    const codeEl = pre.querySelector("code")
    const code = (codeEl || pre).textContent?.trim() || ""
    if (code.length < 5) return

    // Detect language from class
    const classStr = (codeEl || pre).className || ""
    const langMatch = classStr.match(/language-(\w+)/)
    const language = langMatch ? langMatch[1] : "unknown"

    // Detect filename from sibling label
    const parent = pre.parentElement
    const labelEl =
      parent?.querySelector('[class*="filename"], [class*="title"], [class*="label"], [data-testid*="code-title"]') ||
      pre.previousElementSibling

    let filename: string | undefined
    const labelText = labelEl?.textContent?.trim()
    if (labelText && labelText.length < 80 && /\.\w{1,6}$/.test(labelText)) {
      filename = labelText
    }

    // Try to detect filename from first-line comment
    if (!filename) {
      const firstLine = code.split("\n")[0] || ""
      const fileMatch = firstLine.match(/(?:\/\/|#|<!--|\/\*)\s*([\w./\-]+\.\w+)/)
      if (fileMatch) filename = fileMatch[1]
    }

    blocks.push({ language, code, filename })
  })

  return blocks
}

// ─── Text Cleaning ────────────────────────────────────────────────────────────

function cleanText(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")       // non-breaking spaces
    .replace(/\u200b/g, "")        // zero-width spaces
    .replace(/\t/g, " ")           // tabs to spaces
    .replace(/[ ]{3,}/g, "  ")     // collapse long space runs
    .replace(/\n{4,}/g, "\n\n\n")  // max 3 newlines
    .trim()
}

// ─── Strategy 1: data-testid Based (Most Reliable) ───────────────────────────

function strategyTestId(): ExtractedMessage[] | null {
  const userEls = Array.from(document.querySelectorAll(
    '[data-testid="human-turn"], [data-testid="user-turn"], [data-testid*="human-message"], [data-testid*="user-message"]'
  ))
  const assistantEls = Array.from(document.querySelectorAll(
    '[data-testid="assistant-turn"], [data-testid="ai-turn"], [data-testid*="assistant-message"], [data-testid*="ai-message"]'
  ))

  if (userEls.length === 0 && assistantEls.length === 0) return null

  return mergeAndBuildMessages(userEls, "user", assistantEls, "assistant")
}

// ─── Strategy 2: data-role / aria-label Based ─────────────────────────────────

function strategyDataRole(): ExtractedMessage[] | null {
  const roleEls = Array.from(document.querySelectorAll("[data-role]"))
  if (roleEls.length === 0) return null

  const tagged: Array<{ el: Element; role: "user" | "assistant" }> = []
  for (const el of roleEls) {
    const role = el.getAttribute("data-role")
    if (role === "human" || role === "user") tagged.push({ el, role: "user" })
    else if (role === "assistant" || role === "ai" || role === "claude") tagged.push({ el, role: "assistant" })
  }

  if (tagged.length === 0) return null
  return buildMessagesFromTagged(tagged)
}

// ─── Strategy 3: Structural Sibling Analysis ──────────────────────────────────
/**
 * Claude renders conversation turns as direct children of a scroll container.
 * We find that container, then classify each child as user/assistant.
 */
function strategyStructural(): ExtractedMessage[] | null {
  // Look for the scroll container that holds the conversation
  const scrollCandidates = Array.from(
    document.querySelectorAll('[class*="conversation"], [class*="thread"], [class*="chat-content"], [class*="messages"], [class*="transcript"]')
  ).filter(el => !isInSidebarOrNav(el) && !isHiddenElement(el))

  // Also try <main>
  const main = document.querySelector("main")
  if (main && !scrollCandidates.includes(main)) scrollCandidates.unshift(main)

  for (const container of scrollCandidates) {
    const result = extractFromContainer(container)
    if (result && result.length >= 2) return result
  }

  return null
}

function extractFromContainer(container: Element): ExtractedMessage[] | null {
  // Get direct children that have meaningful content
  const children = Array.from(container.children).filter(child => {
    if (isHiddenElement(child)) return false
    if (isInSidebarOrNav(child)) return false
    const text = child.textContent?.trim() || ""
    return text.length > 20
  })

  if (children.length < 2) return null

  const tagged: Array<{ el: Element; role: "user" | "assistant" }> = []

  for (const child of children) {
    const role = inferRoleFromElement(child)
    if (role) tagged.push({ el: child, role })
  }

  if (tagged.length < 2) return null
  return buildMessagesFromTagged(tagged)
}

/**
 * Infer role from an element using multiple heuristics.
 */
function inferRoleFromElement(el: Element): "user" | "assistant" | null {
  const cls = (typeof el.className === "string" ? el.className : "").toLowerCase()
  const testId = (el.getAttribute("data-testid") || "").toLowerCase()
  const role = (el.getAttribute("data-role") || "").toLowerCase()
  const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase()

  // Explicit role indicators
  if (role === "human" || role === "user") return "user"
  if (role === "assistant" || role === "ai" || role === "claude") return "assistant"

  // data-testid indicators
  if (/human|user/.test(testId)) return "user"
  if (/assistant|ai-turn|claude/.test(testId)) return "assistant"

  // aria-label indicators
  if (/human message|user message|you said/.test(ariaLabel)) return "user"
  if (/assistant message|claude(?:'s)? response|ai response/.test(ariaLabel)) return "assistant"

  // Class name heuristics
  if (/human|user-turn|user-message|human-turn/.test(cls)) return "user"
  if (/assistant|ai-turn|claude-turn|bot-turn|model-turn/.test(cls)) return "assistant"

  // Visual layout heuristic: user messages often have different alignment
  // Check for a nested element that suggests user input (textarea origin)
  if (el.querySelector('[class*="user"], [class*="human"], [data-role="user"], [data-role="human"]')) return "user"
  if (el.querySelector('[class*="assistant"], [class*="claude"], [data-role="assistant"]')) return "assistant"

  return null
}

// ─── Strategy 4: Content-Density Alternating Heuristic ───────────────────────
/**
 * Last resort: find large prose blocks, deduplicate, and alternate roles.
 * First message is assumed to be user.
 */
function strategyAlternating(): ExtractedMessage[] | null {
  const main =
    document.querySelector("main") ||
    document.querySelector('[role="main"]') ||
    document.body

  // Find substantial text blocks not in sidebar/nav
  const candidates = Array.from(main.querySelectorAll("div, article, section"))
    .filter(el => {
      if (isHiddenElement(el)) return false
      if (isInSidebarOrNav(el)) return false
      const text = el.textContent?.trim() || ""
      // Must have substantial content
      if (text.length < 80) return false
      // Must not have too many children (avoid wrapper divs)
      if (el.children.length > 15) return false
      return true
    })

  if (candidates.length < 2) return null

  // Compute depth for each candidate
  const withDepth = candidates.map(el => ({
    el,
    depth: getDepth(el),
    textLength: (el.textContent || "").trim().length
  }))

  // Find modal depth (most common = likely message level)
  const depths = withDepth.map(w => w.depth)
  const modalDepth = mode(depths)

  // Keep only elements at the modal depth ± 1
  const atDepth = withDepth.filter(w => Math.abs(w.depth - modalDepth) <= 1)

  if (atDepth.length < 2) return null

  // Deduplicate: remove elements that are children of others in the list
  const deduped: typeof atDepth = []
  for (const item of atDepth) {
    const isChildOfAnother = deduped.some(
      other => other.el.contains(item.el) || item.el.contains(other.el)
    )
    if (!isChildOfAnother) deduped.push(item)
  }

  if (deduped.length < 2) return null

  // Sort by DOM order
  deduped.sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el)
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  })

  // Alternate roles starting with user
  const messages: ExtractedMessage[] = []
  deduped.forEach((item, i) => {
    const prose = extractProseText(item.el)
    const codeBlocks = extractCodeBlocks(item.el)

    if (isLikelyNoise(prose) && codeBlocks.length === 0) return
    if (prose.length < 20 && codeBlocks.length === 0) return

    messages.push({
      id: `msg-${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      content: prose,
      codeBlocks,
      rawLength: item.el.textContent?.length || 0,
      index: i
    })
  })

  return messages.length >= 2 ? messages : null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mergeAndBuildMessages(
  userEls: Element[], userRole: "user",
  assistantEls: Element[], assistantRole: "assistant"
): ExtractedMessage[] {
  const tagged: Array<{ el: Element; role: "user" | "assistant" }> = [
    ...userEls.map(el => ({ el, role: userRole })),
    ...assistantEls.map(el => ({ el, role: assistantRole }))
  ]
  return buildMessagesFromTagged(tagged)
}

function buildMessagesFromTagged(
  tagged: Array<{ el: Element; role: "user" | "assistant" }>
): ExtractedMessage[] {
  // Sort by DOM position
  tagged.sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el)
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  })

  // Deduplicate (remove parent/child overlaps, keep deepest)
  const deduped: typeof tagged = []
  for (const item of tagged) {
    const overlaps = deduped.some(
      prev => prev.el.contains(item.el) || item.el.contains(prev.el)
    )
    if (!overlaps) deduped.push(item)
  }

  const messages: ExtractedMessage[] = []
  deduped.forEach((item, i) => {
    const prose = extractProseText(item.el)
    const codeBlocks = extractCodeBlocks(item.el)

    // Skip if content is pure noise and no code
    if (isLikelyNoise(prose) && codeBlocks.length === 0) return
    if (prose.length < 10 && codeBlocks.length === 0) return

    messages.push({
      id: `msg-${i}`,
      role: item.role,
      content: prose,
      codeBlocks,
      rawLength: item.el.textContent?.length || 0,
      index: i
    })
  })

  return messages
}

// ─── Extraction Quality Validator ─────────────────────────────────────────────

function validateExtraction(
  messages: ExtractedMessage[],
  strategy: string
): ExtractionQuality {
  const issues: string[] = []
  let score = 100

  if (messages.length === 0) {
    return { score: 0, isReliable: false, issues: ["No messages extracted"] }
  }

  // Check for UI noise contamination
  const allText = messages.map(m => m.content).join("\n").toLowerCase()

  const noiseIndicators = [
    { phrase: "free plan", label: "Pricing UI text detected" },
    { phrase: "upgrade to pro", label: "Upgrade prompt detected" },
    { phrase: "new chat", label: "Navigation UI detected" },
    { phrase: "keyboard shortcuts", label: "Settings UI detected" },
    { phrase: "sign out", label: "Account menu detected" },
    { phrase: "search conversations", label: "Sidebar content detected" },
  ]

  for (const { phrase, label } of noiseIndicators) {
    if (allText.includes(phrase)) {
      issues.push(label)
      score -= 25
    }
  }

  // Check for suspiciously short messages on average
  const avgLength = messages.reduce((a, m) => a + m.content.length, 0) / messages.length
  if (avgLength < 30) {
    issues.push("Average message length is very short — possible UI fragment extraction")
    score -= 30
  }

  // Check for minimum message count
  if (messages.length === 1) {
    issues.push("Only 1 message extracted — conversation may not be on screen")
    score -= 20
  }

  // Check role alternation (should roughly alternate user/assistant)
  const roles = messages.map(m => m.role)
  let sameRoleRuns = 0
  for (let i = 1; i < roles.length; i++) {
    if (roles[i] === roles[i - 1]) sameRoleRuns++
  }
  if (sameRoleRuns > messages.length * 0.4) {
    issues.push("Role detection may be unreliable — many consecutive same-role messages")
    score -= 15
  }

  // Penalize alternating strategy (least reliable)
  if (strategy === "alternating") {
    issues.push("Used fallback extraction strategy — roles may be inaccurate")
    score -= 10
  }

  score = Math.max(0, score)
  return {
    score,
    isReliable: score >= 50 && issues.filter(i => i.includes("Pricing") || i.includes("Navigation") || i.includes("Sidebar")).length === 0,
    issues
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function extractClaudeConversation(
  onProgress?: (p: ExtractionProgress) => void
): Promise<ExtractionResult> {
  const t0 = performance.now()

  // 1. Locate the scroll container
  const scrollCandidates = Array.from(
    document.querySelectorAll('[class*="conversation"], [class*="thread"], [class*="chat-content"], [class*="messages"], [class*="transcript"]')
  ).filter(el => !isInSidebarOrNav(el) && !isHiddenElement(el))
  
  // Choose the one with the largest scrollHeight
  let scrollContainer = scrollCandidates.sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
  if (!scrollContainer && document.documentElement.scrollHeight > document.documentElement.clientHeight) {
    scrollContainer = document.documentElement
  }

  const strategies: Array<{ name: string; fn: () => ExtractedMessage[] | null }> = [
    { name: "testid", fn: strategyTestId },
    { name: "data-role", fn: strategyDataRole },
    { name: "structural", fn: strategyStructural },
    { name: "alternating", fn: strategyAlternating },
  ]

  let activeStrategy = strategies[0]
  let firstBatch: ExtractedMessage[] | null = null
  let strategyUsed = "none"

  for (const s of strategies) {
    firstBatch = s.fn()
    if (firstBatch && firstBatch.length > 0) {
      activeStrategy = s
      strategyUsed = s.name
      break
    }
  }

  if (!firstBatch || firstBatch.length === 0) {
    return {
      messages: [],
      strategy: "none",
      quality: { score: 0, isReliable: false, issues: ["All extraction strategies failed"] },
      warnings: ["Could not extract conversation. Make sure you are on a Claude conversation page with messages visible."]
    }
  }

  const extractedMap = new Map<string, ExtractedMessage>()
  const allMessages: ExtractedMessage[] = []

  const mergeBatch = (batch: ExtractedMessage[]) => {
    let added = 0
    // Prepend in reverse to maintain chronological order
    for (let i = batch.length - 1; i >= 0; i--) {
      const msg = batch[i]
      const hash = msg.role + ":" + msg.content.slice(0, 100) + ":" + msg.codeBlocks.length
      if (!extractedMap.has(hash)) {
        extractedMap.set(hash, msg)
        allMessages.unshift(msg)
        added++
      }
    }
    return added
  }

  mergeBatch(firstBatch)

  // 2. Progressively scroll upward
  if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
    let noNewMessagesCount = 0
    let scrollAttempts = 0

    while (noNewMessagesCount < 3 && scrollAttempts < 30) {
      scrollAttempts++
      const lastScroll = scrollContainer.scrollTop

      // Scroll up by ~80% of viewport
      scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - scrollContainer.clientHeight * 0.8)
      
      // Wait for React virtualization to render new nodes
      await new Promise(r => setTimeout(r, 400))

      const batch = activeStrategy.fn() || []
      const added = mergeBatch(batch)

      if (onProgress) {
        onProgress({
          totalFound: allMessages.length,
          userCount: allMessages.filter(m => m.role === "user").length,
          assistantCount: allMessages.filter(m => m.role === "assistant").length,
          codeBlockCount: allMessages.reduce((sum, m) => sum + m.codeBlocks.length, 0),
          durationMs: Math.round(performance.now() - t0)
        })
      }

      if (added === 0) {
        noNewMessagesCount++
      } else {
        noNewMessagesCount = 0
      }

      if (scrollContainer.scrollTop === 0) break

      // If scroll didn't change (forced bottom or stuck)
      if (scrollContainer.scrollTop === lastScroll && lastScroll !== 0) {
        noNewMessagesCount++
      }
    }

    // Scroll back to bottom to restore user view
    scrollContainer.scrollTop = scrollContainer.scrollHeight
  }

  // Re-index chronologically
  allMessages.forEach((m, i) => m.index = i)

  const quality = validateExtraction(allMessages, strategyUsed)
  
  // Heavily penalize if we still only got a few messages
  if (allMessages.length <= 2) {
    quality.score = Math.min(quality.score, 30)
    quality.isReliable = false
    quality.issues.push("Incomplete extraction detected — only 1-2 messages found. Conversation may not be fully loaded.")
  } else if (allMessages.length < 5) {
    quality.score = Math.min(quality.score, 50)
    quality.issues.push("Low message count — continuity context may be weak.")
  }

  return {
    messages: allMessages,
    strategy: strategyUsed,
    quality,
    warnings: quality.issues
  }
}

// ─── Legacy Compatibility ─────────────────────────────────────────────────────
// Keep old shape for any code that still imports ConversationMessage

export async function extractClaudeConversationLegacy() {
  const result = await extractClaudeConversation()
  return result.messages.map(m => ({
    role: m.role,
    content: m.content + (m.codeBlocks.length > 0
      ? "\n\n" + m.codeBlocks.map(cb => "```" + cb.language + "\n" + cb.code + "\n```").join("\n\n")
      : ""),
    index: m.index
  }))
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

function getDepth(el: Element): number {
  let depth = 0
  let current = el.parentElement
  while (current && current !== document.documentElement) {
    depth++
    current = current.parentElement
  }
  return depth
}

function mode(arr: number[]): number {
  const freq: Record<number, number> = {}
  arr.forEach(n => (freq[n] = (freq[n] || 0) + 1))
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1])
  return parseInt(sorted[0]?.[0] ?? "0")
}
