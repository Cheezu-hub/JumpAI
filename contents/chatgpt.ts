/**
 * JumpAI — ChatGPT Destination Injector
 *
 * Responsibilities (destination platform only):
 *  - On every chatgpt.com page load, check chrome.storage.session for a
 *    pending JumpAI packet addressed to "chatgpt"
 *  - Wait for ChatGPT's composer element to become interactive
 *  - Inject the continuation packet into the input WITHOUT auto-sending
 *  - Show a confirmation toast and let the user review before sending
 *
 * ChatGPT Composer Architecture (as of 2024–2025):
 *  - Primary:  <div id="prompt-textarea" contenteditable="true" ...>
 *              This is a ProseMirror editor; execCommand('insertText') is the
 *              most reliable injection path.
 *  - Fallback: Older builds used a <textarea data-id="root"> element.
 *
 * This script performs NO extraction and generates NO packets. It is a pure
 * consumer of whatever claude.tsx produced and the background stored.
 */

import type { PlasmoCSConfig } from "plasmo"
import {
  consumePendingPacket,
  waitForAnyElement,
  injectTextIntoEditor,
  showInjectionToast,
  sleep
} from "~lib/injector-utils"

// ─── Plasmo Config ────────────────────────────────────────────────────────────

export const config: PlasmoCSConfig = {
  matches: ["https://chatgpt.com/*"],
  run_at: "document_idle",
  all_frames: false
}

// ─── ChatGPT Editor Selectors ─────────────────────────────────────────────────
// Ordered by specificity / recency. The first match wins.

const CHATGPT_SELECTORS = [
  // Primary — ProseMirror-based composer (2024+ ChatGPT)
  "#prompt-textarea",
  // Lexical-based builds (some A/B experiments)
  "div[contenteditable='true'][data-lexical-editor='true']",
  // Generic ProseMirror fallback
  "div.ProseMirror[contenteditable='true']",
  // Legacy textarea (pre-2024)
  "textarea[data-id='root']",
  // Last-resort placeholder-based selector
  "textarea[placeholder*='Message']",
]

// ─── Initialisation ───────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Step 1 — Check session storage. Bail immediately if no packet is waiting;
  //          this runs on every ChatGPT page load so the fast-path matters.
  const packetText = await consumePendingPacket("chatgpt")
  if (!packetText) return

  console.log("[JumpAI] Packet found for ChatGPT. Waiting for composer…")

  // Step 2 — ChatGPT is a React SPA. The composer may not exist in the DOM
  //          immediately after document_idle fires, especially while the app
  //          is hydrating or navigating to /c/new. Poll for up to 20 seconds.
  const found = await waitForAnyElement(CHATGPT_SELECTORS, 40, 500)

  if (!found) {
    console.warn("[JumpAI] ChatGPT composer not found after 20 s. Packet dropped.")
    return
  }

  const { element, selector } = found
  console.log(`[JumpAI] Composer found — selector: "${selector}"`)

  // Step 3 — Give React/ProseMirror a moment to finish hydrating the editor
  //          instance so that execCommand is properly wired up.
  await sleep(350)

  // Step 4 — Inject. injectTextIntoEditor handles contenteditable vs textarea
  //          and tries three methods (execCommand → ClipboardEvent → textContent).
  const success = injectTextIntoEditor(element as HTMLElement, packetText)

  if (success) {
    showInjectionToast("ChatGPT")
    console.log("[JumpAI] Packet injected into ChatGPT successfully.")
  } else {
    console.error("[JumpAI] All injection methods failed for ChatGPT.")
  }
}

init()
