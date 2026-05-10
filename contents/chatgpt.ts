import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://chatgpt.com/*"],
  run_at: "document_idle"
}

// Ensure it runs once
let injected = false

function init() {
  if (injected) return
  injected = true

  // Listen for the background script message with the packet
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "PASTE_PACKET" && message.text) {
      console.log("[JumpAI] Received packet to paste.")
      pastePacket(message.text)
      sendResponse({ success: true })
    }
  })
}

async function pastePacket(text: string) {
  // Wait for the textarea to be available
  let textarea: HTMLTextAreaElement | null = null
  for (let i = 0; i < 20; i++) {
    textarea = document.querySelector("#prompt-textarea") as HTMLTextAreaElement
    if (textarea) break
    await new Promise(r => setTimeout(r, 500))
  }

  if (!textarea) {
    console.warn("[JumpAI] Could not find ChatGPT textarea.")
    return
  }

  // Focus and paste
  textarea.focus()
  
  // To paste in React apps, we often need to simulate the input event
  // However, ChatGPT's ProseMirror editor handles standard 'insertText' commands well
  const success = document.execCommand("insertText", false, text)
  
  if (!success) {
    // Fallback if execCommand fails
    textarea.value = text
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
  }

  // Ensure textarea resizes
  textarea.dispatchEvent(new Event("input", { bubbles: true }))
  textarea.focus()
  
  console.log("[JumpAI] Packet pasted successfully.")
}

init()
