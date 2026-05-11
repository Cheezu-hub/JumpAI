/**
 * JumpAI — Claude Source Content Script
 *
 * Responsibilities (source platform only):
 *  - Inject the floating JumpAI panel UI into all claude.ai pages
 *  - Drive conversation extraction (via lib/extractor.ts)
 *  - Build the continuation packet (via lib/packet-builder.ts)
 *  - Send an OPEN_TAB message to the background worker, which stores
 *    the packet in chrome.storage.session and opens the destination tab
 *
 * This script does NOT inject anything into destination platforms.
 * ChatGPT injection → contents/chatgpt.ts
 * Gemini injection  → contents/gemini.ts
 */

import cssText from "data-text:~/style.css"
import type {
  PlasmoCSConfig,
  PlasmoGetShadowHostId,
  PlasmoGetStyle
} from "plasmo"
import React from "react"

import { JumpPanel } from "~components/JumpPanel"

// ─── Plasmo Config ────────────────────────────────────────────────────────────

export const config: PlasmoCSConfig = {
  matches: ["https://claude.ai/*"],
  all_frames: false,
  run_at: "document_idle"
}

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

// ─── Mount Point ──────────────────────────────────────────────────────────────

// Fixed ID ensures only one JumpAI instance per page
export const getShadowHostId: PlasmoGetShadowHostId = () =>
  "jumpai-extension-host"

// ─── Root Component ───────────────────────────────────────────────────────────

export default function ContentScript() {
  return <JumpPanel />
}
