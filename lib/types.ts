// ─── Core Message Types ───────────────────────────────────────────────────────

export interface ConversationMessage {
  role: "user" | "assistant"
  content: string
  index: number
}

// ─── V2: Classified Message ───────────────────────────────────────────────────

export type MessageCategory =
  | "goal"
  | "error"
  | "decision"
  | "implementation"
  | "todo"
  | "fix"
  | "code"
  | "debug"
  | "blocker"
  | "noise"

export interface ClassifiedMessage extends ConversationMessage {
  category: MessageCategory
  importance: number // 0–100
  signals: string[] // what signals triggered this classification
}

// ─── V2: Continuation Score ───────────────────────────────────────────────────

export interface ContinuationScore {
  completeness: number       // 0–100
  clarity: number            // 0–100
  continuationReadiness: number // 0–100
  overall: number
  missingCriticalContext: string[]
  warnings: string[]
}

// ─── V2: Compression Mode ─────────────────────────────────────────────────────

export type CompressionMode = "compact" | "balanced" | "detailed"

// ─── V2: Smart Continuation Packet ───────────────────────────────────────────

export interface ContinuationPacket {
  // Core
  objective: string
  currentImplementationStatus: string
  activeDebuggingContext: string
  // Architecture
  importantArchitectureDecisions: string
  filesAndComponents: string
  // Problems
  recentFailures: string
  attemptedFixes: string
  knownConstraints: string
  // Action
  nextImmediateAction: string
  // Meta
  score: ContinuationScore
  tokenEstimate: number
  mode: CompressionMode
  extractedAt: number
}

// ─── V2: Debug Stats ──────────────────────────────────────────────────────────

export interface ExtractionDebugStats {
  totalMessages: number
  classifiedByCategory: Record<MessageCategory, number>
  discardedNoise: number
  averageImportance: number
  topSignals: string[]
  compressionRatio: string
  processingTimeMs: number
}

// ─── Platform ─────────────────────────────────────────────────────────────────

export type TargetPlatform = "chatgpt" | "gemini" | "claude" | "cursor"

export interface Platform {
  id: TargetPlatform
  label: string
  url: string
  icon: string
  description: string
  promptStyle: "concise" | "contextual" | "structured"
}

export const PLATFORMS: Platform[] = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    url: "https://chatgpt.com/",
    icon: "chatgpt",
    description: "OpenAI · GPT-4o",
    promptStyle: "concise"
  },
  {
    id: "gemini",
    label: "Gemini",
    url: "https://gemini.google.com/app",
    icon: "gemini",
    description: "Google · Gemini 1.5",
    promptStyle: "contextual"
  }
]

// ─── Messages ─────────────────────────────────────────────────────────────────

export type MessageType =
  | { type: "EXTRACT_CONVERSATION" }
  | { type: "CONVERSATION_DATA"; messages: ConversationMessage[] }
  | { type: "OPEN_TAB"; url: string; packetText?: string }
  | { type: "ERROR"; message: string }

// ─── UI State ─────────────────────────────────────────────────────────────────

export type PanelState = "idle" | "extracting" | "copied" | "error"
export type PanelView = "main" | "preview" | "debug"
