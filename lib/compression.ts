import type { ClassifiedMessage, CompressionMode } from "./types"
import { isNoise } from "./classifiers"

// ─── Token Estimation ─────────────────────────────────────────────────────────

/**
 * Rough token estimator: ~4 chars per token (OpenAI standard approximation).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ─── Context Ranker ───────────────────────────────────────────────────────────

/**
 * Ranks classified messages by their usefulness for continuation.
 * Returns messages sorted by rank score (highest first).
 */
export function rankMessages(
  messages: ClassifiedMessage[]
): ClassifiedMessage[] {
  return [...messages].sort((a, b) => {
    // Primary: importance score
    const importanceDiff = b.importance - a.importance

    // Secondary: prefer recent messages (higher index)
    const recencyScore = (b.index - a.index) * 0.3

    return importanceDiff + recencyScore
  })
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * Removes near-duplicate messages based on content similarity.
 * Uses a sliding window of content hashes.
 */
export function deduplicateMessages(
  messages: ClassifiedMessage[]
): ClassifiedMessage[] {
  const seen = new Set<string>()
  const result: ClassifiedMessage[] = []

  for (const msg of messages) {
    // Create a "fingerprint" from the first 200 chars, normalized
    const fingerprint = msg.content
      .slice(0, 200)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()

    if (!seen.has(fingerprint)) {
      seen.add(fingerprint)
      result.push(msg)
    }
  }

  return result
}

// ─── Compression Pipeline ─────────────────────────────────────────────────────

interface CompressionConfig {
  maxTokens: number
  keepCategories: Set<ClassifiedMessage["category"]>
  minImportance: number
  maxMessagesPerCategory: number
}

const COMPRESSION_CONFIGS: Record<CompressionMode, CompressionConfig> = {
  compact: {
    maxTokens: 1200,
    keepCategories: new Set(["goal", "error", "blocker", "decision", "todo"]),
    minImportance: 70,
    maxMessagesPerCategory: 2
  },
  balanced: {
    maxTokens: 2500,
    keepCategories: new Set([
      "goal", "error", "blocker", "decision",
      "fix", "debug", "implementation", "todo"
    ]),
    minImportance: 45,
    maxMessagesPerCategory: 4
  },
  detailed: {
    maxTokens: 5000,
    keepCategories: new Set([
      "goal", "error", "blocker", "decision",
      "fix", "debug", "implementation", "todo", "code"
    ]),
    minImportance: 20,
    maxMessagesPerCategory: 8
  }
}

export interface CompressionResult {
  kept: ClassifiedMessage[]
  discarded: ClassifiedMessage[]
  tokenEstimate: number
  compressionRatio: string
}

export function compressMessages(
  classified: ClassifiedMessage[],
  mode: CompressionMode
): CompressionResult {
  const config = COMPRESSION_CONFIGS[mode]

  // 1. Remove pure noise
  const nonNoise = classified.filter((m) => !isNoise(m))
  const discardedNoise = classified.filter((m) => isNoise(m))

  // 2. Deduplicate
  const deduped = deduplicateMessages(nonNoise)

  // 3. Filter by minimum importance and allowed categories
  const filtered = deduped.filter(
    (m) =>
      m.importance >= config.minImportance &&
      config.keepCategories.has(m.category)
  )

  // 4. Apply per-category caps — prefer most important/recent
  const categoryCount: Record<string, number> = {}
  const capped: ClassifiedMessage[] = []
  const discardedCap: ClassifiedMessage[] = []

  // Sort by importance desc, then by recency desc
  const sorted = [...filtered].sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance
    return b.index - a.index
  })

  for (const msg of sorted) {
    const count = categoryCount[msg.category] || 0
    if (count < config.maxMessagesPerCategory) {
      categoryCount[msg.category] = count + 1
      capped.push(msg)
    } else {
      discardedCap.push(msg)
    }
  }

  // 5. Sort kept messages by original index (chronological order)
  capped.sort((a, b) => a.index - b.index)

  // 6. Token budget enforcement
  const tokenBudget: ClassifiedMessage[] = []
  let tokenCount = 0

  for (const msg of capped) {
    const msgTokens = estimateTokens(msg.content)
    if (tokenCount + msgTokens <= config.maxTokens) {
      tokenBudget.push(msg)
      tokenCount += msgTokens
    } else {
      discardedCap.push(msg)
    }
  }

  const discarded = [...discardedNoise, ...discardedCap]
  const originalTokens = estimateTokens(classified.map((m) => m.content).join(" "))
  const keptTokens = estimateTokens(tokenBudget.map((m) => m.content).join(" "))

  const ratio =
    originalTokens > 0
      ? `${Math.round((1 - keptTokens / originalTokens) * 100)}% reduction`
      : "0% reduction"

  return {
    kept: tokenBudget,
    discarded,
    tokenEstimate: keptTokens,
    compressionRatio: ratio
  }
}
