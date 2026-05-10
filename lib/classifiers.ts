import type { ClassifiedMessage, MessageCategory } from "./types"
import type { ExtractedMessage } from "./extractor"

// ─── Signal Weights ──────────────────────────────────────────────────────────
// Each pattern returns a { category, importance, signal } tuple.
// Higher importance = more likely to survive compression.

interface Signal {
  category: MessageCategory
  importance: number
  signal: string
}

// ─── Pattern Banks ───────────────────────────────────────────────────────────

const GOAL_PATTERNS: RegExp[] = [
  /(?:i want(?:\s+you)?\s+to|i(?:'m|\s+am)\s+(?:trying|building|creating|making)\s+(?:to\s+)?|help\s+me\s+(?:to\s+)?|my\s+goal\s+is\s+(?:to\s+)?|we(?:'re|\s+are)\s+building|let(?:'s|\s+us)\s+(?:build|create|implement|make|design|write|fix|add|refactor))\s+(.{15,400})/gi,
  /^(?:build|create|implement|make|design|write|develop|fix|add|update|refactor|migrate|port)\s+(.{15,300})/gim,
  /(?:the\s+goal|our\s+objective|the\s+task|the\s+project)\s+is\s+(?:to\s+)?(.{15,300})/gi
]

const ERROR_PATTERNS: RegExp[] = [
  /(?:TypeError|SyntaxError|ReferenceError|ValueError|AttributeError|ImportError|ModuleNotFoundError|RuntimeError|UnhandledPromiseRejection|ENOENT|EACCES|ECONNREFUSED)[:\s].{0,300}/gi,
  /(?:error|exception|failed|failure|crash|panic)(?:\s*:|\s+in|\s+at|\s+with)?\s+.{10,250}/gi,
  /(?:cannot\s+(?:read|find|resolve|import)|failed\s+to\s+(?:compile|load|parse|build|connect|start|install)|undefined\s+is\s+not\s+a).{0,200}/gi,
  /(?:404|500|403|401|422)\s*(?:error|not found|forbidden|unauthorized).{0,150}/gi,
  /(?:^.*\(node:.*\).*$)/gm // Node.js stack traces
]

const FIX_PATTERNS: RegExp[] = [
  /(?:i\s+tried|i\s+attempted|we\s+tried|tried\s+(?:using|with|adding|changing|removing|replacing)|i\s+changed|i\s+updated|i\s+replaced|i\s+switched|i\s+moved|i\s+added|i\s+removed|i\s+deleted).{0,350}/gi,
  /(?:the\s+fix\s+(?:is|was)|fixed\s+by|solution[:\s]|to\s+fix\s+this|this\s+should\s+fix|workaround[:\s]|patched\s+by).{0,250}/gi
]

const DECISION_PATTERNS: RegExp[] = [
  /(?:decided\s+to|going\s+with|we(?:'re|\s+are)\s+using|choosing\s+|went\s+with|switched\s+to|opting\s+for|architecture\s+(?:decision|choice)|design\s+(?:decision|choice)).{0,300}/gi,
  /(?:instead\s+of|rather\s+than|not\s+using).{0,200}/gi,
  /(?:the\s+reason\s+(?:we|i)|because\s+(?:it|we|the)).{0,200}/gi
]

const IMPLEMENTATION_PATTERNS: RegExp[] = [
  /(?:here(?:'s|\s+is)\s+(?:the|a)\s+(?:implementation|code|solution|component|function|hook|class|module)|i(?:'ve|\s+have)\s+(?:created|built|implemented|added|set\s+up|configured|written|updated)).{0,300}/gi,
  /(?:the\s+(?:implementation|code|function|component|hook|module)\s+(?:is|looks|now)).{0,200}/gi
]

const DEBUG_PATTERNS: RegExp[] = [
  /(?:debugging|let(?:'s|\s+me)\s+(?:debug|trace|investigate|check|inspect|log)|console\.(?:log|error|warn)|print\s+statement|breakpoint|stack\s+trace|stepping\s+through).{0,250}/gi,
  /(?:the\s+issue\s+is|the\s+problem\s+is|the\s+root\s+cause|this\s+is\s+(?:caused|happening)\s+because).{0,250}/gi
]

const BLOCKER_PATTERNS: RegExp[] = [
  /(?:blocked\s+(?:by|on)|can(?:'t|not)\s+(?:proceed|continue|move\s+forward)|stuck\s+(?:on|at|with)|this\s+is\s+preventing|need\s+to\s+(?:resolve|fix|address)\s+before).{0,250}/gi,
  /(?:unresolved|outstanding|pending|waiting\s+(?:on|for)|depends\s+on).{0,200}/gi
]

const TODO_PATTERNS: RegExp[] = [
  /(?:TODO|FIXME|HACK|NOTE|LATER|PENDING)[:\s].{0,200}/gi,
  /(?:still\s+need\s+to|next\s+(?:step|task|thing)|remaining\s+(?:task|work|step)|need\s+to\s+(?:add|implement|fix|update|test)).{0,200}/gi
]

const NOISE_PATTERNS: RegExp[] = [
  /^(?:ok|okay|sure|great|got\s+it|sounds\s+good|perfect|absolutely|definitely|of\s+course|no\s+problem|happy\s+to\s+help).{0,50}$/gi,
  /^(?:let\s+me|i(?:'ll|\s+will)\s+(?:now|help|look|check|explain|walk\s+you)).{0,100}$/gi,
  /^(?:here(?:'s|\s+is)\s+(?:a\s+)?(?:the\s+)?(?:simple\s+)?(?:brief\s+)?(?:quick\s+)?)?(?:explanation|summary|overview|breakdown|walkthrough).{0,50}$/gi,
  /^(?:feel\s+free\s+to|let\s+me\s+know\s+if|hope\s+(?:this|that)\s+helps|does\s+this\s+(?:help|work|make\s+sense|answer)).{0,100}$/gi
]

const CODE_SIGNAL_PATTERNS: RegExp[] = [
  /```[\w]*\n[\s\S]{50,}/g, // Code blocks with content
  /(?:const|let|var|function|class|interface|type|export|import|def|fn\s+|pub\s+fn)\s+\w+/g
]

// ─── Noise Phrases (exact sentence-level noise) ───────────────────────────────

const NOISE_PHRASES = new Set([
  "let me know if you have any questions",
  "feel free to ask if you need clarification",
  "hope this helps",
  "happy to help",
  "let me know if this works",
  "let me know how it goes",
  "does this make sense",
  "let me explain",
  "here is the explanation",
  "here is an overview",
  "i understand"
])

// ─── Classifier ───────────────────────────────────────────────────────────────

function detectSignals(content: string, role: "user" | "assistant"): Signal[] {
  const signals: Signal[] = []
  const lower = content.toLowerCase()

  // Error signals — highest importance
  for (const pat of ERROR_PATTERNS) {
    pat.lastIndex = 0
    if (pat.test(content)) {
      signals.push({ category: "error", importance: 90, signal: "error_pattern" })
      break
    }
  }

  // Blocker signals
  for (const pat of BLOCKER_PATTERNS) {
    pat.lastIndex = 0
    if (pat.test(content)) {
      signals.push({ category: "blocker", importance: 88, signal: "blocker_pattern" })
      break
    }
  }

  // Goal signals — high importance, primarily user messages
  if (role === "user") {
    for (const pat of GOAL_PATTERNS) {
      pat.lastIndex = 0
      if (pat.test(content)) {
        signals.push({ category: "goal", importance: 85, signal: "goal_pattern" })
        break
      }
    }
  }

  // Debug signals
  for (const pat of DEBUG_PATTERNS) {
    pat.lastIndex = 0
    if (pat.test(content)) {
      signals.push({ category: "debug", importance: 82, signal: "debug_pattern" })
      break
    }
  }

  // Decision signals
  for (const pat of DECISION_PATTERNS) {
    pat.lastIndex = 0
    if (pat.test(content)) {
      signals.push({ category: "decision", importance: 80, signal: "decision_pattern" })
      break
    }
  }

  // Fix signals
  for (const pat of FIX_PATTERNS) {
    pat.lastIndex = 0
    if (pat.test(content)) {
      signals.push({ category: "fix", importance: 75, signal: "fix_pattern" })
      break
    }
  }

  // Implementation signals
  for (const pat of IMPLEMENTATION_PATTERNS) {
    pat.lastIndex = 0
    if (pat.test(content)) {
      signals.push({ category: "implementation", importance: 70, signal: "implementation_pattern" })
      break
    }
  }

  // Code block signals
  for (const pat of CODE_SIGNAL_PATTERNS) {
    pat.lastIndex = 0
    if (pat.test(content)) {
      signals.push({ category: "code", importance: 65, signal: "code_block" })
      break
    }
  }

  // TODO signals
  for (const pat of TODO_PATTERNS) {
    pat.lastIndex = 0
    if (pat.test(content)) {
      signals.push({ category: "todo", importance: 60, signal: "todo_pattern" })
      break
    }
  }

  // Noise detection — applies to both roles
  let isNoise = false
  for (const pat of NOISE_PATTERNS) {
    pat.lastIndex = 0
    if (pat.test(content.trim())) {
      isNoise = true
      break
    }
  }
  if (!isNoise) {
    const lowerTrimmed = lower.trim()
    for (const phrase of NOISE_PHRASES) {
      if (lowerTrimmed.includes(phrase)) {
        isNoise = true
        break
      }
    }
  }
  // Very short messages with no signals are also noise
  if (content.trim().length < 30 && signals.length === 0) {
    isNoise = true
  }

  if (isNoise && signals.length === 0) {
    signals.push({ category: "noise", importance: 5, signal: "noise_pattern" })
  }

  return signals
}

function selectDominantSignal(signals: Signal[]): Signal {
  if (signals.length === 0) {
    return { category: "implementation", importance: 40, signal: "default" }
  }
  // Pick the highest importance signal
  return signals.reduce((a, b) => (b.importance > a.importance ? b : a))
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function classifyMessages(messages: ExtractedMessage[]): ClassifiedMessage[] {
  return messages.map((msg) => {
    // Include code block content in classification to detect errors/implementations in code
    const codeText = msg.codeBlocks.map(cb => cb.code).join("\n")
    const fullContent = msg.content + (codeText ? "\n" + codeText : "")

    const signals = detectSignals(fullContent, msg.role)
    const dominant = selectDominantSignal(signals)

    // Recency boost: messages in the last 20% of conversation get +15 importance
    const recencyThreshold = Math.floor(messages.length * 0.8)
    const recencyBoost = msg.index >= recencyThreshold ? 15 : 0

    // Code block boost: messages with code are inherently important
    const codeBoost = msg.codeBlocks.length > 0 ? 10 : 0

    // Role boost: user messages that set goals are extra important
    const roleBoost = msg.role === "user" && dominant.category === "goal" ? 10 : 0

    return {
      role: msg.role,
      content: msg.content,
      index: msg.index,
      category: dominant.category,
      importance: Math.min(100, dominant.importance + recencyBoost + codeBoost + roleBoost),
      signals: signals.map((s) => s.signal)
    }
  })
}

export function isNoise(msg: ClassifiedMessage): boolean {
  return msg.category === "noise" || msg.importance < 15
}
