/**
 * JumpAI — Destination Platform Injection Utilities
 *
 * Shared helpers used by ChatGPT and Gemini content scripts to:
 *  - Read and consume pending packets from session storage
 *  - Wait for the target AI editor element to become available
 *  - Inject text reliably into contenteditable (ProseMirror / Quill)
 *    and legacy textarea editors
 *  - Show a non-intrusive confirmation toast on the destination page
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Packets older than 5 min are considered stale and are discarded. */
const STORAGE_TTL_MS = 5 * 60 * 1000

// ─── Storage Handoff ──────────────────────────────────────────────────────────

export interface PendingPacket {
  text: string
  timestamp: number
  platform: string
}

/**
 * Reads and immediately removes a pending packet for the given platform
 * from chrome.storage.session. Returns null if nothing is pending or the
 * packet has expired. "Consuming" prevents duplicate injection on refresh.
 */
export async function consumePendingPacket(platform: string): Promise<string | null> {
  const key = `jumpai_pending_${platform}`

  try {
    const result = await chrome.storage.session.get(key)
    const packet = result[key] as PendingPacket | undefined

    if (!packet) return null

    if (Date.now() - packet.timestamp > STORAGE_TTL_MS) {
      await chrome.storage.session.remove(key)
      console.warn("[JumpAI] Packet expired, discarding.")
      return null
    }

    // Remove immediately so a page refresh doesn't re-inject
    await chrome.storage.session.remove(key)
    return packet.text
  } catch (err) {
    console.error("[JumpAI] storage.session read failed:", err)
    return null
  }
}

// ─── DOM Polling ──────────────────────────────────────────────────────────────

/**
 * Polls until one of the given CSS selectors matches an element in the DOM.
 * Returns the first match found along with the selector that matched, or null
 * after maxAttempts × intervalMs milliseconds.
 */
export async function waitForAnyElement(
  selectors: string[],
  maxAttempts = 40,
  intervalMs = 500
): Promise<{ element: Element; selector: string } | null> {
  for (let i = 0; i < maxAttempts; i++) {
    for (const selector of selectors) {
      const el = document.querySelector(selector)
      if (el) return { element: el, selector }
    }
    await sleep(intervalMs)
  }
  return null
}

// ─── Text Injection ───────────────────────────────────────────────────────────

/**
 * Injects text into a DOM element, handling both plain `<textarea>` inputs and
 * `contenteditable` rich editors (ProseMirror used by ChatGPT, Quill used by
 * Gemini). Three methods are tried in order so that at least one succeeds
 * regardless of how the framework intercepts DOM events.
 *
 * @returns true if the editor appears to contain the injected text afterwards.
 */
export function injectTextIntoEditor(element: HTMLElement, text: string): boolean {
  const tag = element.tagName.toLowerCase()
  const isTextarea = tag === "textarea"
  const isContentEditable =
    element.isContentEditable ||
    element.getAttribute("contenteditable") === "true"

  if (isTextarea) {
    return injectIntoTextarea(element as HTMLTextAreaElement, text)
  }

  if (isContentEditable) {
    return injectIntoContentEditable(element, text)
  }

  // Unknown element type — attempt contenteditable path anyway
  console.warn("[JumpAI] Element is neither textarea nor contenteditable; attempting generic injection.")
  return injectIntoContentEditable(element, text)
}

// ─── Textarea Injection ───────────────────────────────────────────────────────

function injectIntoTextarea(ta: HTMLTextAreaElement, text: string): boolean {
  try {
    // Use the native value setter so React's synthetic event system picks it up
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set

    if (nativeSetter) {
      nativeSetter.call(ta, text)
    } else {
      ta.value = text
    }

    ta.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }))
    ta.dispatchEvent(new Event("change", { bubbles: true }))
    ta.focus()
    return true
  } catch (err) {
    console.error("[JumpAI] Textarea injection failed:", err)
    return false
  }
}

// ─── ContentEditable Injection ────────────────────────────────────────────────

function injectIntoContentEditable(el: HTMLElement, text: string): boolean {
  el.focus()

  // ── Method 1: execCommand ─────────────────────────────────────────────────
  // Works reliably for ProseMirror (ChatGPT) and Quill (Gemini) because both
  // editors expose the standard `beforeinput` / `input` event pipeline that
  // execCommand triggers under the hood.
  try {
    // Select and replace any pre-existing content
    document.execCommand("selectAll", false)
    const inserted = document.execCommand("insertText", false, text)

    if (inserted && el.textContent && el.textContent.trim().length > 0) {
      // Fire an extra synthetic input event so frameworks that debounce
      // native events still pick up the change
      el.dispatchEvent(new InputEvent("input", { bubbles: true }))
      console.log("[JumpAI] Injected via execCommand(insertText).")
      return true
    }
  } catch (_) { /* fall through */ }

  // ── Method 2: Clipboard paste simulation ─────────────────────────────────
  // For frameworks that intercept the `paste` ClipboardEvent (Quill, newer
  // ProseMirror builds). This mirrors what the user would get by pressing Ctrl+V.
  try {
    el.focus()
    // Ensure the editor is empty before pasting
    document.execCommand("selectAll", false)
    document.execCommand("delete", false)

    const dt = new DataTransfer()
    dt.setData("text/plain", text)

    const pasteEvent = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    })

    el.dispatchEvent(pasteEvent)

    if (el.textContent && el.textContent.trim().length > 0) {
      console.log("[JumpAI] Injected via ClipboardEvent(paste).")
      return true
    }
  } catch (_) { /* fall through */ }

  // ── Method 3: Direct DOM mutation + synthetic input event ────────────────
  // Last resort. Sets textContent directly and dispatches an InputEvent.
  // Less reliable for React/Vue controlled components but handles any remaining
  // edge cases.
  try {
    el.focus()
    el.innerHTML = ""
    el.textContent = text
    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: text
      })
    )
    el.dispatchEvent(new Event("change", { bubbles: true }))
    console.log("[JumpAI] Injected via textContent mutation.")
    return el.textContent.trim().length > 0
  } catch (err) {
    console.error("[JumpAI] All injection methods exhausted:", err)
    return false
  }
}

// ─── Toast Notification ───────────────────────────────────────────────────────

/**
 * Shows a brief branded toast in the top-right corner of the destination page
 * confirming that the JumpAI context packet was loaded.
 * Auto-dismisses after 4 seconds.
 */
export function showInjectionToast(platformLabel: string): void {
  // Prevent duplicate toasts
  if (document.getElementById("jumpai-toast")) return

  const style = document.createElement("style")
  style.textContent = `
    @keyframes jumpai-in  { from { opacity:0; transform:translateY(-8px) scale(0.97) } to { opacity:1; transform:none } }
    @keyframes jumpai-out { from { opacity:1; transform:none } to { opacity:0; transform:translateY(-8px) scale(0.97) } }
    #jumpai-toast { animation: jumpai-in 0.28s cubic-bezier(0.16,1,0.3,1) both; }
    #jumpai-toast.leaving { animation: jumpai-out 0.22s ease forwards; }
  `
  document.head.appendChild(style)

  const toast = document.createElement("div")
  toast.id = "jumpai-toast"
  Object.assign(toast.style, {
    position: "fixed",
    top: "18px",
    right: "18px",
    zIndex: "2147483647",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 16px",
    background: "rgba(12,12,14,0.97)",
    border: "1px solid rgba(204,120,92,0.45)",
    borderRadius: "10px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 16px rgba(204,120,92,0.08)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: "13px",
    fontWeight: "500",
    color: "rgba(255,255,255,0.9)",
    userSelect: "none",
    pointerEvents: "none"
  })

  toast.innerHTML = `
    <div style="width:8px;height:8px;border-radius:50%;background:#cc785c;box-shadow:0 0 8px #cc785c;flex-shrink:0"></div>
    <div>
      <span style="color:#cc785c;font-weight:700">JumpAI</span>
      &nbsp;— Context loaded for <strong>${platformLabel}</strong>.
      <span style="color:rgba(255,255,255,0.45);font-size:11px;margin-left:6px">Review &amp; send when ready.</span>
    </div>
  `

  document.body.appendChild(toast)

  setTimeout(() => {
    toast.classList.add("leaving")
    setTimeout(() => toast.remove(), 300)
  }, 4000)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
