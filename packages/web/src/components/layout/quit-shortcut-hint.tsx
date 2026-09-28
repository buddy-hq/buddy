import { useEffect, useRef, useState } from "react"
import { z } from "zod"
import { language } from "@/context/language"

/** Dispatched on `window` by the desktop renderer while a Cmd+Q waits for a hold or second press. */
const QUIT_SHORTCUT_EVENT = "buddy:quit-shortcut"
const quitShortcutDetailSchema = z.object({ visible: z.boolean() })

/** A released hint lingers so a quick tap stays readable. */
const HINT_LINGER_MS = 1200

/** Tells the user that the Cmd+Q they just pressed needs a hold or a second press to quit. */
export function QuitShortcutHint() {
  const [visible, setVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const onQuitShortcut = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const parsed = quitShortcutDetailSchema.safeParse(event.detail)
      if (!parsed.success) return
      clearTimeout(hideTimer.current)
      if (parsed.data.visible) {
        setVisible(true)
        return
      }
      hideTimer.current = setTimeout(() => setVisible(false), HINT_LINGER_MS)
    }
    window.addEventListener(QUIT_SHORTCUT_EVENT, onQuitShortcut)
    return () => {
      clearTimeout(hideTimer.current)
      window.removeEventListener(QUIT_SHORTCUT_EVENT, onQuitShortcut)
    }
  }, [])

  if (!visible) return null
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[22%] z-100 flex justify-center"
    >
      <div className="rounded-full border border-border-base bg-surface-raised-base px-6 py-3 text-lg font-semibold text-text-strong shadow-xl">
        {language.t("app.quitShortcutHint")}
      </div>
    </div>
  )
}
