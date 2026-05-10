import React, { useCallback, useEffect, useState } from "react"
import { extractClaudeConversation } from "../lib/extractor"
import type { ExtractedMessage, ExtractionResult, ExtractionProgress } from "../lib/extractor"
import { buildContinuationPacket, formatPacketForPlatform } from "../lib/packet-builder"
import { PLATFORMS } from "../lib/types"
import type { PanelState, TargetPlatform, CompressionMode, ContinuationPacket } from "../lib/types"
import { JumpAILogo } from "./Icons"
import { PlatformButton } from "./PlatformButton"

const STYLES = `
@keyframes ji-spin { to { transform: rotate(360deg); } }
@keyframes ji-up { from { opacity:0; transform:translateY(10px) scale(0.97) } to { opacity:1; transform:translateY(0) scale(1) } }
@keyframes ji-in { from { opacity:0 } to { opacity:1 } }
@keyframes ji-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
`

const CAT_COLORS: Record<string, string> = {
  goal:"#60a5fa", error:"#f87171", blocker:"#fb923c", decision:"#a78bfa",
  implementation:"#34d399", debug:"#fbbf24", fix:"#f472b6", code:"#94a3b8",
  todo:"#c4b5fd", noise:"rgba(255,255,255,0.15)"
}

// ── Preview View ─────────────────────────────────────────────────────────────

function PreviewView({ packet, platformId }: { packet: ContinuationPacket; platformId: string }) {
  const [copied, setCopied] = useState(false)
  const text = formatPacketForPlatform(packet, platformId)

  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const sections = [
    { label: "🎯 Objective", val: packet.objective },
    { label: "🏗 Current Status", val: packet.currentImplementationStatus },
    { label: "🐛 Active Issue", val: packet.activeDebuggingContext },
    { label: "🧠 Architecture", val: packet.importantArchitectureDecisions },
    { label: "📁 Files", val: packet.filesAndComponents },
    { label: "⚠ Recent Failures", val: packet.recentFailures },
    { label: "🛠 Attempted Fixes", val: packet.attemptedFixes },
    { label: "🔒 Constraints", val: packet.knownConstraints },
    { label: "➡ Next Step", val: packet.nextImmediateAction },
  ].filter(s => s.val && s.val.trim() !== "")

  return (
    <div style={{ animation: "ji-in 0.2s ease" }}>
      <div style={{ padding: "7px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: packet.score.overall >= 70 ? "#4ade80" : packet.score.overall >= 40 ? "#fbbf24" : "#f87171" }}>
            {packet.score.overall}
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.3)" }}>/100<br/>confidence</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.25)", background: "rgba(0,0,0,0.3)", padding: "3px 6px", borderRadius: 4 }}>
            ~{packet.tokenEstimate} tokens
          </span>
          <button onClick={copy} style={{
            padding: "4px 10px", borderRadius: 6, fontSize: 10.5, fontWeight: 600, cursor: "pointer", outline: "none",
            background: copied ? "rgba(74,222,128,0.15)" : "rgba(204,120,92,0.15)",
            border: copied ? "1px solid rgba(74,222,128,0.4)" : "1px solid rgba(204,120,92,0.4)",
            color: copied ? "#4ade80" : "#cc785c", transition: "all 0.15s"
          }}>{copied ? "✓ Copied" : "Copy"}</button>
        </div>
      </div>

      {packet.score.warnings.map((w, i) => (
        <div key={i} style={{ padding: "6px 14px", fontSize: 10, color: "rgba(251,191,36,0.9)", background: "rgba(251,191,36,0.08)", borderBottom: "1px solid rgba(251,191,36,0.15)", display: "flex", gap: 6 }}>
          <span>⚠</span><span>{w}</span>
        </div>
      ))}

      <div style={{ maxHeight: 280, overflowY: "auto", padding: "4px 0" }}>
        {sections.map(({ label, val }) => (
          <div key={label} style={{ padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, whiteSpace: "pre-wrap" as const }}>
              {val}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Diagnostics View ─────────────────────────────────────────────────────────

function DiagnosticsView({ result, stats }: { result: ExtractionResult | null, stats: any }) {
  if (!result) return (
    <div style={{ padding: "20px 14px", textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
      Run an extraction to see diagnostics.
    </div>
  )

  const { messages, strategy, quality } = result
  const cats = stats ? Object.entries(stats.classifiedByCategory as Record<string, number>) : []

  return (
    <div style={{ maxHeight: 320, overflowY: "auto", animation: "ji-in 0.2s ease" }}>
      
      {/* Extraction Metrics */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Extraction Metrics</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            ["Strategy", strategy], ["Extracted", `${messages.length} msgs`],
            ["Score", `${quality.score}/100`], ["Time", stats ? `${stats.processingTimeMs}ms` : "-"],
            ["Discarded", stats ? `${stats.discardedNoise} noise` : "-"], ["Reduction", stats ? stats.compressionRatio : "-"],
          ].map(([l, v]) => (
            <div key={l} style={{ padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Category Breakdown */}
      {stats && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Category Classification</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {cats.map(([cat, count]) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.04)", padding: "3px 8px", borderRadius: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: CAT_COLORS[cat] || "#888" }} />
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>{cat} <span style={{ opacity: 0.5 }}>×{count}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw Messages List */}
      <div style={{ padding: "10px 0" }}>
        <div style={{ padding: "0 14px", fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Raw Message Context</div>
        {messages.map((msg) => (
          <div key={msg.id} style={{
            padding: "6px 14px", borderBottom: "1px solid rgba(255,255,255,0.03)",
            background: msg.role === "user" ? "rgba(96,165,250,0.03)" : "transparent"
          }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 3, color: msg.role === "user" ? "#60a5fa" : "#cc785c" }}>
              [{msg.role.toUpperCase()}] <span style={{ opacity: 0.5 }}>· {msg.content.length}c</span>
              {msg.codeBlocks.length > 0 && <span style={{ color: "#94a3b8", marginLeft: 6 }}>+{msg.codeBlocks.length} code</span>}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", lineHeight: 1.4, whiteSpace: "pre-wrap" as const, maxHeight: 60, overflow: "hidden" }}>
              {msg.content.slice(0, 150)}{msg.content.length > 150 ? "…" : ""}
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}

// ── Main Panel ───────────────────────────────────────────────────────────────

type Tab = "continue" | "preview" | "diagnostics"

export function JumpPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [panelState, setPanelState] = useState<PanelState>("idle")
  const [activeTarget, setActiveTarget] = useState<TargetPlatform | null>(null)
  const [statusMsg, setStatusMsg] = useState("")
  const [mode, setMode] = useState<CompressionMode>("balanced")
  const [tab, setTab] = useState<Tab>("continue")
  
  const [packet, setPacket] = useState<ContinuationPacket | null>(null)
  const [debugStats, setDebugStats] = useState<any>(null)
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null)
  const [lastPlatformId, setLastPlatformId] = useState("chatgpt")
  const [progress, setProgress] = useState<ExtractionProgress | null>(null)

  const isLoading = panelState === "extracting"
  const isCopied = panelState === "copied"
  const isError = panelState === "error"
  const hasResult = extractionResult !== null

  const handleExtractAndJump = useCallback(async (platform?: typeof PLATFORMS[0]) => {
    if (platform) {
      setActiveTarget(platform.id)
      setLastPlatformId(platform.id)
    }
    setPanelState("extracting")
    setStatusMsg("Scrolling to extract history…")
    setProgress(null)

    try {
      const result = await extractClaudeConversation((p) => {
        setProgress(p)
        setStatusMsg(`Extracting… ${p.totalFound} messages found`)
      })
      
      setExtractionResult(result)

      if (!result.quality.isReliable) {
        setPanelState("error")
        setStatusMsg("Low confidence extraction — check Diagnostics")
        setTab("diagnostics")
        setTimeout(() => { setPanelState("idle"); setActiveTarget(null) }, 4000)
        return
      }

      setStatusMsg("Classifying & compressing…")
      await new Promise(r => setTimeout(r, 60))

      const { packet: built, debugStats: stats } = buildContinuationPacket(result.messages, mode)
      setPacket(built)
      setDebugStats(stats)

      if (platform) {
        const text = formatPacketForPlatform(built, platform.id)
        await navigator.clipboard.writeText(text)
        setPanelState("copied")
        setStatusMsg(`✓ Ready to continue (~${built.tokenEstimate} tokens)`)

        await new Promise(r => setTimeout(r, 700))
        chrome.runtime.sendMessage({ type: "OPEN_TAB", url: platform.url })

        setTimeout(() => { setPanelState("idle"); setActiveTarget(null) }, 2500)
      } else {
        setPanelState("idle")
        setStatusMsg("")
        setTab("preview")
      }
    } catch (err) {
      console.error("[JumpAI]", err)
      setPanelState("error")
      setStatusMsg("Extraction failed — check Diagnostics")
      setTab("diagnostics")
      setTimeout(() => { setPanelState("idle"); setActiveTarget(null) }, 3000)
    }
  }, [mode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && isOpen) setIsOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen])

  const dotColor = isCopied ? "#4ade80" : isError ? "#f87171" : isLoading ? "#fbbf24" : "#cc785c"

  return (
    <>
      <style>{STYLES}</style>
      {/* Floating Button */}
      <button onClick={() => setIsOpen(v => !v)}
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2147483646,
          display: "flex", alignItems: "center", gap: 7, padding: "9px 14px 9px 11px",
          background: "rgba(12,12,14,0.97)",
          border: isOpen ? "1px solid rgba(204,120,92,0.45)" : "1px solid rgba(255,255,255,0.10)",
          borderRadius: 999, cursor: "pointer", outline: "none",
          boxShadow: isOpen ? "0 8px 32px rgba(0,0,0,0.75), 0 0 20px rgba(204,120,92,0.15)" : "0 4px 24px rgba(0,0,0,0.6)",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          transition: "all 0.2s cubic-bezier(0.16,1,0.3,1)",
          animation: !isOpen ? "ji-float 3s ease-in-out infinite" : "none",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0, boxShadow: `0 0 7px ${dotColor}`, transition: "background 0.3s" }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.88)", userSelect: "none" as const }}>JumpAI</span>
        <span style={{ fontSize: 8.5, color: "#cc785c", fontWeight: 700 }}>v2</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" strokeLinecap="round" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </button>

      {/* Panel */}
      {isOpen && (
        <div style={{
          position: "fixed", bottom: 70, right: 24, zIndex: 2147483647, width: 320,
          background: "rgba(11,11,13,0.98)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16,
          boxShadow: "0 16px 64px rgba(0,0,0,0.85)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          overflow: "hidden", animation: "ji-up 0.2s cubic-bezier(0.16,1,0.3,1)",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        }}>
          {/* Header */}
          <div style={{ padding: "12px 14px 11px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(204,120,92,0.15)", border: "1px solid rgba(204,120,92,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#cc785c" }}>
              <JumpAILogo size={14} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", letterSpacing: "-0.01em" }}>JumpAI</span>
            {packet && <span style={{ marginLeft: "auto", fontSize: 9.5, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.05)", padding: "3px 6px", borderRadius: 4 }}>~{packet.tokenEstimate}t</span>}
          </div>

          {/* Status bar */}
          {(isLoading || isCopied || isError) && (
            <div style={{ padding: "7px 14px", display: "flex", alignItems: "center", gap: 8, background: isCopied ? "rgba(74,222,128,0.07)" : isError ? "rgba(248,113,113,0.07)" : "rgba(251,191,36,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)", animation: "ji-in 0.2s ease" }}>
              {isLoading && <div style={{ width: 12, height: 12, border: "2px solid rgba(251,191,36,0.2)", borderTopColor: "#fbbf24", borderRadius: "50%", animation: "ji-spin 0.7s linear infinite", flexShrink: 0 }} />}
              {isCopied && <span style={{ color: "#4ade80", fontSize: 13, fontWeight: "bold" }}>✓</span>}
              {isError && <span style={{ color: "#f87171", fontSize: 13, fontWeight: "bold" }}>⚠</span>}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, fontWeight: 500, color: isCopied ? "#4ade80" : isError ? "#f87171" : "rgba(251,191,36,0.9)" }}>{statusMsg}</div>
                {isLoading && progress && (
                  <div style={{ fontSize: 9, color: "rgba(251,191,36,0.6)", marginTop: 2 }}>User: {progress.userCount} · AI: {progress.assistantCount}</div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 4, padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            {(["compact", "balanced", "detailed"] as CompressionMode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: "5px", borderRadius: 6, cursor: "pointer", outline: "none",
                border: mode === m ? "1px solid rgba(204,120,92,0.5)" : "1px solid rgba(255,255,255,0.06)",
                background: mode === m ? "rgba(204,120,92,0.12)" : "rgba(255,255,255,0.02)",
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: mode === m ? "#cc785c" : "rgba(255,255,255,0.4)", textTransform: "capitalize" }}>{m}</div>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "0 10px" }}>
            {(["continue", "preview", "diagnostics"] as Tab[]).map((t) => {
              const disabled = !hasResult && t !== "continue"
              return (
                <button key={t} onClick={() => !disabled && setTab(t)} style={{
                  padding: "8px 12px", fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
                  color: tab === t ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
                  background: "transparent", border: "none", outline: "none", textTransform: "capitalize",
                  borderBottom: tab === t ? "2px solid #cc785c" : "2px solid transparent",
                  cursor: disabled ? "not-allowed" : "pointer", marginBottom: -1, opacity: disabled ? 0.4 : 1, transition: "all 0.15s"
                }}>{t}</button>
              )
            })}
          </div>

          {tab === "continue" && (
            <div style={{ padding: "12px 14px 14px" }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Jump to platform</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {PLATFORMS.map(p => (
                  <PlatformButton key={p.id} platform={p} onClick={() => handleExtractAndJump(p)}
                    disabled={isLoading || isCopied} loading={activeTarget === p.id && isLoading} />
                ))}
              </div>
              <button onClick={() => handleExtractAndJump()} disabled={isLoading} style={{
                marginTop: 10, width: "100%", padding: "7px", borderRadius: 8, cursor: "pointer",
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 500, outline: "none",
                transition: "all 0.15s", opacity: isLoading ? 0.5 : 1
              }}>
                Extract and Preview First
              </button>
            </div>
          )}

          {tab === "preview" && packet && <PreviewView packet={packet} platformId={lastPlatformId} />}
          {tab === "preview" && !packet && <div style={{ padding: "24px 14px", textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Click 'Extract and Preview' first.</div>}

          {tab === "diagnostics" && <DiagnosticsView result={extractionResult} stats={debugStats} />}

          <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <p style={{ fontSize: 9.5, color: "rgba(255,255,255,0.2)", margin: 0, lineHeight: 1.5 }}>
              {mode === "compact" ? "Compact: <1k tokens. Core issues & next steps only."
                : mode === "detailed" ? "Detailed: ~5k tokens. Full debug context & history."
                : "Balanced: ~2.5k tokens. Best for most continuations."}
            </p>
          </div>
        </div>
      )}

      {isOpen && <div onClick={() => setIsOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 2147483644 }} />}
    </>
  )
}
