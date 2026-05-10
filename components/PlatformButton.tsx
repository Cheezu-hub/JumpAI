import React from "react"
import type { Platform } from "../lib/types"
import { ChatGPTIcon, GeminiIcon } from "./Icons"

interface PlatformButtonProps {
  platform: Platform
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}

export function PlatformButton({
  platform,
  onClick,
  disabled = false,
  loading = false
}: PlatformButtonProps) {
  const Icon = platform.id === "chatgpt" ? ChatGPTIcon : GeminiIcon

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        width: "100%",
        padding: "10px 12px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "10px",
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.15s ease",
        textAlign: "left",
        outline: "none",
        WebkitAppearance: "none"
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          ;(e.currentTarget as HTMLElement).style.background =
            "rgba(255,255,255,0.08)"
          ;(e.currentTarget as HTMLElement).style.borderColor =
            "rgba(255,255,255,0.14)"
          ;(e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"
        }
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.background =
          "rgba(255,255,255,0.04)"
        ;(e.currentTarget as HTMLElement).style.borderColor =
          "rgba(255,255,255,0.08)"
        ;(e.currentTarget as HTMLElement).style.transform = "translateY(0)"
      }}
      onMouseDown={(e) => {
        ;(e.currentTarget as HTMLElement).style.transform = "translateY(0) scale(0.98)"
      }}
      onMouseUp={(e) => {
        ;(e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"
      }}>
      {/* Icon */}
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          background: "rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: "rgba(255,255,255,0.85)"
        }}>
        {loading ? (
          <div
            style={{
              width: 16,
              height: 16,
              border: "1.5px solid rgba(255,255,255,0.15)",
              borderTopColor: "rgba(255,255,255,0.8)",
              borderRadius: "50%",
              animation: "jumpai-spin 0.7s linear infinite"
            }}
          />
        ) : (
          <Icon size={17} />
        )}
      </div>

      {/* Labels */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "rgba(255,255,255,0.9)",
            letterSpacing: "-0.01em",
            lineHeight: 1.2
          }}>
          {loading ? "Preparing…" : `Continue in ${platform.label}`}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.35)",
            marginTop: 2,
            letterSpacing: "0.01em"
          }}>
          {platform.description}
        </div>
      </div>

      {/* Arrow */}
      {!loading && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      )}
    </button>
  )
}
