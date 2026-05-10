/**
 * JumpAI Popup
 * Shown when clicking the extension icon in the Chrome toolbar.
 * Useful when visiting non-Claude pages or for quick access.
 */

import React, { useEffect, useState } from "react"

import { JumpAILogo, ChatGPTIcon, GeminiIcon } from "~components/Icons"
import { PLATFORMS } from "~lib/types"

import "~/style.css"

// ─── Popup ────────────────────────────────────────────────────────────────────

export default function Popup() {
  const [isClaudePage, setIsClaudePage] = useState<boolean | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url || ""
      setIsClaudePage(url.includes("claude.ai"))
    })
  }, [])

  const openPlatform = (url: string) => {
    chrome.tabs.create({ url, active: true })
    window.close()
  }

  return (
    <div
      style={{
        width: 260,
        minHeight: 200,
        background: "#0b0b0d",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "rgba(255,255,255,0.88)",
        overflow: "hidden"
      }}>
      {/* Header */}
      <div
        style={{
          padding: "16px 16px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "center",
          gap: 10
        }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: "rgba(204, 120, 92, 0.12)",
            border: "1px solid rgba(204, 120, 92, 0.22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#cc785c"
          }}>
          <JumpAILogo size={17} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 5 }}>
            JumpAI
            <span style={{ fontSize: 9, fontWeight: 700, color: "#cc785c", letterSpacing: "0.04em" }}>v2</span>
          </div>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
            AI State Transfer Engine
          </div>
        </div>
      </div>

      {/* Status */}
      <div style={{ padding: "12px 16px 10px" }}>
        {isClaudePage === null ? (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            Checking page…
          </div>
        ) : isClaudePage ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "7px 10px",
              background: "rgba(74,222,128,0.08)",
              border: "1px solid rgba(74,222,128,0.15)",
              borderRadius: 8,
              marginBottom: 12
            }}>
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#4ade80",
                boxShadow: "0 0 8px rgba(74,222,128,0.5)"
              }}
            />
            <span style={{ fontSize: 11.5, color: "rgba(74,222,128,0.9)" }}>
              Claude detected — floating button is active
            </span>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "7px 10px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              marginBottom: 12
            }}>
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.25)"
              }}
            />
            <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)" }}>
              Open Claude to activate JumpAI
            </span>
          </div>
        )}

        {/* Platform shortcuts */}
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 500,
            color: "rgba(255,255,255,0.25)",
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            marginBottom: 8
          }}>
          Quick Open
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {PLATFORMS.map((platform) => {
            const Icon = platform.id === "chatgpt" ? ChatGPTIcon : GeminiIcon
            return (
              <button
                key={platform.id}
                onClick={() => openPlatform(platform.url)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "9px 10px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 9,
                  cursor: "pointer",
                  transition: "all 0.13s ease",
                  outline: "none",
                  width: "100%",
                  textAlign: "left"
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background =
                    "rgba(255,255,255,0.08)"
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background =
                    "rgba(255,255,255,0.04)"
                }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    background: "rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(255,255,255,0.8)",
                    flexShrink: 0
                  }}>
                  <Icon size={14} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.85)"
                    }}>
                    {platform.label}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "rgba(255,255,255,0.3)",
                      marginTop: 1
                    }}>
                    {platform.description}
                  </div>
                </div>
                <svg
                  style={{ marginLeft: "auto", flexShrink: 0 }}
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="2"
                  strokeLinecap="round">
                  <path d="M7 17L17 7M17 7H7M17 7v10" />
                </svg>
              </button>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "10px 16px 14px",
          borderTop: "1px solid rgba(255,255,255,0.04)"
        }}>
        <p
          style={{
            fontSize: 10.5,
            color: "rgba(255,255,255,0.18)",
            margin: 0,
            lineHeight: 1.5
          }}>
          Visit claude.ai to use the JumpAI panel. Select compression mode, preview your context packet, and jump to any AI platform.
        </p>
      </div>
    </div>
  )
}
