import type { MessageType } from "../lib/types"

// ─── Background Service Worker ────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log("[JumpAI] Extension installed.")
})

chrome.runtime.onMessage.addListener(
  (message: MessageType, _sender, sendResponse) => {
    if (message.type === "OPEN_TAB") {
      chrome.tabs
        .create({ url: message.url, active: true })
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          console.error("[JumpAI] Failed to open tab:", err)
          sendResponse({ success: false, error: err.message })
        })

      // Return true to keep the message channel open for async response
      return true
    }
  }
)
