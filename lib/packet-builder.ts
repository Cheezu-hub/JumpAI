import type { ContinuationPacket, ContinuationScore, ClassifiedMessage, CompressionMode } from "./types"
import { classifyMessages } from "./classifiers"
import { compressMessages, estimateTokens } from "./compression"
import type { ExtractedMessage } from "./extractor"

// ─── Pattern Libraries ────────────────────────────────────────────────────────

const FILE_PATTERN = /\b[\w./\-]+\.(?:tsx|ts|jsx|js|py|rs|go|java|kt|swift|rb|php|css|scss|html|json|yaml|yml|toml|env|md|sql|sh|bash|prisma|graphql|vue|svelte)\b/g
const COMPONENT_PATTERN = /(?:(?:<|\/\/\s*component[:\s]|interface\s+|type\s+|class\s+|function\s+|const\s+|def\s+|fn\s+)([A-Z]\w+))/g
const VERSION_PATTERN = /v?\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?/g

// ─── Objective Extractor ──────────────────────────────────────────────────────

function extractObjective(msgs: ClassifiedMessage[]): string {
  const goals = msgs.filter((m) => m.category === "goal" && m.role === "user")
  if (goals.length > 0) {
    // Use the first user goal statement
    const text = goals[0].content
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    return text.length > 500 ? text.slice(0, 500) + "…" : text
  }

  // Fallback: first user message
  const firstUser = msgs.find((m) => m.role === "user")
  if (firstUser) {
    const text = firstUser.content.replace(/\n+/g, " ").replace(/\s+/g, " ").trim()
    return text.length > 400 ? text.slice(0, 400) + "…" : text
  }

  return "Not explicitly stated — infer from conversation context."
}

// ─── Implementation Status ────────────────────────────────────────────────────

function extractImplementationStatus(msgs: ClassifiedMessage[]): string {
  const impls = msgs.filter(
    (m) => m.role === "assistant" && (m.category === "implementation" || m.category === "code")
  )

  if (impls.length === 0) return "No implementation progress recorded."

  const lastImpl = impls[impls.length - 1]
  const items: string[] = []

  // Extract bullet points from implementation messages
  const bullets = lastImpl.content.match(/^[\s]*[-*•]\s+.{10,200}$/gm) || []
  const numbered = lastImpl.content.match(/^[\s]*\d+\.\s+.{10,200}$/gm) || []

  ;[...bullets, ...numbered].slice(0, 6).forEach((b) => {
    items.push(b.trim().replace(/^[-*•\d.]+\s+/, ""))
  })

  if (items.length > 0) {
    return items.map((i) => `• ${capitalize(i)}`).join("\n")
  }

  // Fallback: last meaningful sentences from last assistant impl message
  const sentences = lastImpl.content
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 30)
    .slice(0, 3)

  return sentences.join(" ") || "See conversation for implementation details."
}

// ─── Active Debugging Context ─────────────────────────────────────────────────

function extractDebuggingContext(msgs: ClassifiedMessage[]): string {
  const debugMsgs = msgs.filter(
    (m) => m.category === "debug" || m.category === "error" || m.category === "blocker"
  )

  if (debugMsgs.length === 0) return "No active debugging context."

  const parts: string[] = []

  // Most recent error/debug context
  const recent = debugMsgs.slice(-3)
  for (const msg of recent) {
    const label = msg.category === "error" ? "ERROR" : msg.category === "blocker" ? "BLOCKER" : "DEBUG"
    const snippet = msg.content.replace(/\n+/g, " ").replace(/\s+/g, " ").trim()
    parts.push(`[${label}] ${snippet.slice(0, 300)}`)
  }

  return parts.join("\n")
}

// ─── Architecture Decisions ───────────────────────────────────────────────────

function extractArchitectureDecisions(msgs: ClassifiedMessage[]): string {
  const decisions = msgs.filter((m) => m.category === "decision")

  if (decisions.length === 0) return "No explicit architecture decisions recorded."

  const seen = new Set<string>()
  const items: string[] = []

  for (const msg of decisions) {
    const text = msg.content.replace(/\n+/g, " ").replace(/\s+/g, " ").trim()
    const snippet = text.slice(0, 250)
    if (!seen.has(snippet)) {
      seen.add(snippet)
      items.push(snippet)
    }
  }

  return items.slice(0, 5).map((i) => `• ${capitalize(i)}`).join("\n")
}

// ─── Files and Components ─────────────────────────────────────────────────────

function extractFilesAndComponents(msgs: ClassifiedMessage[]): string {
  const allText = msgs.map((m) => m.content).join("\n")
  const files = new Set<string>()
  const components = new Set<string>()

  const fileMatches = allText.match(FILE_PATTERN) || []
  fileMatches.forEach((f) => {
    if (!f.includes("node_modules") && f.split("/").length < 7) files.add(f)
  })

  let match: RegExpExecArray | null
  const compPat = new RegExp(COMPONENT_PATTERN.source, "g")
  while ((match = compPat.exec(allText)) !== null) {
    if (match[1] && match[1].length > 2 && match[1].length < 50) {
      components.add(match[1])
    }
  }

  const parts: string[] = []
  if (files.size > 0) {
    parts.push(`Files:\n${[...files].slice(0, 15).map((f) => `  • ${f}`).join("\n")}`)
  }
  if (components.size > 0) {
    parts.push(`Components/Classes:\n${[...components].slice(0, 10).map((c) => `  • ${c}`).join("\n")}`)
  }

  return parts.length > 0 ? parts.join("\n\n") : "None explicitly identified."
}

// ─── Recent Failures ──────────────────────────────────────────────────────────

function extractRecentFailures(msgs: ClassifiedMessage[]): string {
  const errors = msgs.filter((m) => m.category === "error")
  if (errors.length === 0) return "No failures recorded in this session."

  const recent = errors.slice(-4)
  return recent
    .map((e) => {
      const text = e.content.replace(/\n+/g, " ").replace(/\s+/g, " ").trim()
      return `• ${text.slice(0, 280)}`
    })
    .join("\n")
}

// ─── Attempted Fixes ─────────────────────────────────────────────────────────

function extractAttemptedFixes(msgs: ClassifiedMessage[]): string {
  const fixes = msgs.filter((m) => m.category === "fix")
  if (fixes.length === 0) return "No documented fix attempts."

  const seen = new Set<string>()
  const items: string[] = []

  for (const msg of fixes) {
    const text = msg.content.replace(/\n+/g, " ").replace(/\s+/g, " ").trim()
    const key = text.slice(0, 120)
    if (!seen.has(key)) {
      seen.add(key)
      items.push(text.slice(0, 250))
    }
  }

  return items.slice(0, 5).map((i) => `• ${capitalize(i)}`).join("\n")
}

// ─── Known Constraints ────────────────────────────────────────────────────────

function extractKnownConstraints(msgs: ClassifiedMessage[]): string {
  const allText = msgs.map((m) => m.content).join("\n")
  const constraints = new Set<string>()

  const constraintPatterns = [
    /(?:must\s+(?:be|use|not|avoid|have|support)|should\s+(?:be|use|not|avoid|have)|cannot\s+use|don(?:'t|\s+not)\s+use|requirement[s]?[:\s]|constraint[s]?[:\s]|limitation[s]?[:\s]).{10,200}/gi,
    /(?:only\s+(?:use|works\s+with|supports?)|no\s+(?:external|cloud|backend|server|api\s+key)).{10,150}/gi
  ]

  for (const pat of constraintPatterns) {
    pat.lastIndex = 0
    const matches = allText.match(pat) || []
    matches.slice(0, 4).forEach((m) => {
      const clean = m.trim()
      if (clean.length > 15) constraints.add(clean)
    })
  }

  // Extract tech versions as constraints
  const versions = [...new Set(allText.match(VERSION_PATTERN) || [])].slice(0, 5)
  if (versions.length > 0) {
    constraints.add(`Versions: ${versions.join(", ")}`)
  }

  if (constraints.size === 0) return "No explicit constraints identified."

  return [...constraints].slice(0, 6).map((c) => `• ${capitalize(c)}`).join("\n")
}

// ─── Next Immediate Action ────────────────────────────────────────────────────

function extractNextAction(msgs: ClassifiedMessage[]): string {
  // First check for TODOs
  const todos = msgs.filter((m) => m.category === "todo")
  if (todos.length > 0) {
    const lastTodo = todos[todos.length - 1]
    const text = lastTodo.content.replace(/\n+/g, " ").replace(/\s+/g, " ").trim()
    return text.slice(0, 400)
  }

  // Check last assistant message for next-step language
  const assistantMsgs = msgs.filter((m) => m.role === "assistant")
  if (assistantMsgs.length === 0) return "Begin implementing the stated objective."

  const lastMsg = assistantMsgs[assistantMsgs.length - 1].content

  const nextStepPatterns = [
    /(?:next[,\s]+(?:you(?:'ll|\s+should|\s+can|\s+need\s+to)?|we(?:'ll|\s+should|\s+can)?|let(?:'s|\s+us)\s+)|now\s+(?:you\s+can|we\s+can|let(?:'s|\s+us))|the\s+(?:remaining|outstanding|pending)\s+(?:task|step|work)).{15,350}/gi,
    /(?:you(?:'ll|\s+should|\s+need\s+to)\s+(?:then|next|now)|step\s+\d+[:\s]).{15,300}/gi
  ]

  for (const pat of nextStepPatterns) {
    pat.lastIndex = 0
    const match = pat.exec(lastMsg)
    if (match) return capitalize(match[0].trim().replace(/[.]+$/, "")) + "."
  }

  // Last resort: final sentences of last assistant message
  const sentences = lastMsg
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 25)
  const last = sentences[sentences.length - 1]?.trim()
  return last && last.length < 500
    ? last
    : "Continue from the last point — review the final assistant message."
}

// ─── Continuation Quality Scorer ──────────────────────────────────────────────

function scoreContinuation(
  packet: Omit<ContinuationPacket, "score" | "tokenEstimate" | "mode" | "extractedAt">,
  originalCount: number,
  keptCount: number
): ContinuationScore {
  const missing: string[] = []
  const warnings: string[] = []

  // Completeness: did we extract something useful in each field?
  const unknowns = [
    packet.objective.includes("Not explicitly"),
    packet.activeDebuggingContext.includes("No active"),
    packet.importantArchitectureDecisions.includes("No explicit"),
    packet.recentFailures.includes("No failures"),
    packet.nextImmediateAction.includes("Begin implementing")
  ]
  const knownCount = unknowns.filter((u) => !u).length
  const completeness = Math.round((knownCount / unknowns.length) * 100)

  if (packet.objective.includes("Not explicitly")) missing.push("Project objective")
  if (packet.recentFailures.includes("No failures") && packet.activeDebuggingContext.includes("No active")) {
    // OK — clean session, no issues
  } else if (packet.activeDebuggingContext.includes("No active") && !packet.recentFailures.includes("No failures")) {
    missing.push("Active debugging context")
  }

  // Clarity: is objective longer than a vague statement?
  const clarity = packet.objective.length > 80 ? 85 : packet.objective.length > 40 ? 60 : 35

  // Continuation readiness: based on having next step + debugging context
  let readiness = 50
  if (!packet.nextImmediateAction.includes("Continue from")) readiness += 25
  if (!packet.activeDebuggingContext.includes("No active")) readiness += 15
  if (!packet.filesAndComponents.includes("None")) readiness += 10

  let overall = Math.round((completeness + clarity + readiness) / 3)

  if (originalCount <= 2) {
    overall = Math.min(overall, 30)
    warnings.push("Incomplete extraction detected — conversation may not be fully loaded")
  } else if (originalCount < 5) {
    overall = Math.min(overall, 50)
    warnings.push("Low message count — continuity context may be weak")
  } else if (keptCount < 5 && originalCount > 15) {
    warnings.push("Very few messages survived compression — consider using 'detailed' mode")
  }

  if (keptCount === 0) {
    warnings.push("No messages extracted — extraction may have failed")
  }
  if (packet.objective.length < 50 && !packet.objective.includes("Not explicitly")) {
    warnings.push("Objective is brief — add more context to your first message")
  }

  return {
    completeness,
    clarity,
    continuationReadiness: readiness,
    overall,
    missingCriticalContext: missing,
    warnings
  }
}

// ─── Smart Packet Builder ─────────────────────────────────────────────────────

export function buildContinuationPacket(
  rawMessages: ExtractedMessage[],
  mode: CompressionMode = "balanced"
): { packet: ContinuationPacket; debugStats: ReturnType<typeof buildDebugStats> } {
  const t0 = performance.now()

  // 1. Classify
  const classified = classifyMessages(rawMessages)

  // 2. Compress
  const { kept, discarded, tokenEstimate, compressionRatio } = compressMessages(classified, mode)

  // 3. Build packet sections from kept messages
  const coreFields = {
    objective: extractObjective(kept.length > 0 ? kept : classified),
    currentImplementationStatus: mode === "compact" ? "" : extractImplementationStatus(kept),
    activeDebuggingContext: extractDebuggingContext(kept),
    importantArchitectureDecisions: mode === "compact" ? "" : extractArchitectureDecisions(kept),
    filesAndComponents: extractFilesAndComponents(kept.length > 0 ? kept : classified),
    recentFailures: mode === "compact" ? "" : extractRecentFailures(kept),
    attemptedFixes: mode === "compact" ? "" : extractAttemptedFixes(kept),
    knownConstraints: mode === "compact" ? "" : extractKnownConstraints(kept.length > 0 ? kept : classified),
    nextImmediateAction: extractNextAction(kept.length > 0 ? kept : classified)
  }

  // 4. Score the packet
  const score = scoreContinuation(coreFields, rawMessages.length, kept.length)

  const packet: ContinuationPacket = {
    ...coreFields,
    score,
    tokenEstimate,
    mode,
    extractedAt: Date.now()
  }

  const processingTimeMs = Math.round(performance.now() - t0)
  const debugStats = buildDebugStats(classified, discarded, processingTimeMs, compressionRatio)

  return { packet, debugStats }
}

function buildDebugStats(
  classified: ReturnType<typeof classifyMessages>,
  discarded: ReturnType<typeof classifyMessages>,
  processingTimeMs: number,
  compressionRatio: string
) {
  const byCategory = classified.reduce(
    (acc, m) => {
      acc[m.category] = (acc[m.category] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const signals = classified.flatMap((m) => m.signals)
  const signalFreq = signals.reduce(
    (acc, s) => {
      acc[s] = (acc[s] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const topSignals = Object.entries(signalFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([s, n]) => `${s} (×${n})`)

  const avgImportance =
    classified.length > 0
      ? Math.round(classified.reduce((a, m) => a + m.importance, 0) / classified.length)
      : 0

  return {
    totalMessages: classified.length,
    classifiedByCategory: byCategory,
    discardedNoise: discarded.length,
    averageImportance: avgImportance,
    topSignals,
    compressionRatio,
    processingTimeMs,
    classifiedMessages: classified,
    discardedMessages: discarded
  }
}

// ─── Platform Adapters ────────────────────────────────────────────────────────

export function formatPacketForPlatform(
  packet: ContinuationPacket,
  platformId: string
): string {
  // Platform-specific header hints
  const platformHints: Record<string, string> = {
    chatgpt: "You are continuing a technical coding session. Be concise and action-oriented.",
    gemini: "You are resuming a development workflow. Use the full context below to continue precisely where the work left off.",
    claude: "This is a continuation of a previous Claude session. Resume with full awareness of the state below.",
    default: "Continue this AI session exactly where it left off. Read the full packet before responding."
  }

  const hint = platformHints[platformId] || platformHints.default
  const div = "─".repeat(60)
  const scoreBar = renderScoreBar(packet.score.overall)

const getSection = (title: string, content: string) => {
    if (!content || content.includes("Omitted")) return ""
    return `\n${div}\n${title}\n${div}\n${content}\n`
  }

  return `
╔════════════════════════════════════════════════════════════╗
║           JUMPAI V2 — AI STATE TRANSFER PACKET            ║
╚════════════════════════════════════════════════════════════╝

${hint}

Context Confidence: ${scoreBar} ${packet.score.overall}/100
Compression Mode: ${packet.mode.toUpperCase()} | ~${packet.tokenEstimate} tokens
${packet.score.warnings.length > 0 ? `⚠  ${packet.score.warnings.join(" | ")}` : "✓  Context quality is good"}
${getSection("OBJECTIVE", packet.objective)}${getSection("CURRENT IMPLEMENTATION STATUS", packet.currentImplementationStatus)}${getSection("ACTIVE DEBUGGING CONTEXT", packet.activeDebuggingContext)}${getSection("IMPORTANT ARCHITECTURE DECISIONS", packet.importantArchitectureDecisions)}${getSection("FILES & COMPONENTS", packet.filesAndComponents)}${getSection("RECENT FAILURES", packet.recentFailures)}${getSection("ATTEMPTED FIXES", packet.attemptedFixes)}${getSection("KNOWN CONSTRAINTS", packet.knownConstraints)}${getSection("NEXT IMMEDIATE ACTION", packet.nextImmediateAction)}
${div}
⚠  Generated by JumpAI v2. Do NOT acknowledge this packet — immediately
   continue from NEXT IMMEDIATE ACTION as if you wrote all the above code.
${div}
`.trim()
}

function renderScoreBar(score: number): string {
  const filled = Math.round(score / 10)
  return "█".repeat(filled) + "░".repeat(10 - filled)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}
