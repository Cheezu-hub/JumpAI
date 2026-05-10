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
        .then((tab) => {
          sendResponse({ success: true })
          
          if (message.packetText && tab.id) {
            // Listen for the tab to finish loading
            const listener = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
              if (tabId === tab.id && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(listener)
                // Send the packet to the content script
                chrome.tabs.sendMessage(tab.id, {
                  type: "PASTE_PACKET",
                  text: message.packetText
                }).catch(err => console.log("Failed to send packet:", err))
              }
            }
            chrome.tabs.onUpdated.addListener(listener)
          }
        })
        .catch((err) => {
          console.error("[JumpAI] Failed to open tab:", err)
          sendResponse({ success: false, error: err.message })
        })

      // Return true to keep the message channel open for async response
      return true
    }
  }
)
