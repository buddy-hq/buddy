import { useEffect, useRef } from "react"
import { isRightCommandKey } from "./chat-input"

/** Modifier keydowns observed in this window, independent of event modifier flags. */
export type PhysicalModifierKeys = {
  rightCommandPressed: boolean
  shiftPressed: boolean
  altPressed: boolean
}

/** Track physical modifier keys across focus changes within the window. */
export function usePhysicalModifierKeys(active = true) {
  const pressed = useRef<PhysicalModifierKeys>({
    rightCommandPressed: false,
    shiftPressed: false,
    altPressed: false,
  })

  useEffect(() => {
    if (!active) return

    const update = (event: KeyboardEvent, isPressed: boolean) => {
      if (isRightCommandKey(event)) pressed.current.rightCommandPressed = isPressed
      if (event.key === "Shift") pressed.current.shiftPressed = isPressed
      if (event.key === "Alt") pressed.current.altPressed = isPressed
    }
    const onKeyDown = (event: KeyboardEvent) => update(event, true)
    const onKeyUp = (event: KeyboardEvent) => update(event, false)
    const reset = () => {
      pressed.current.rightCommandPressed = false
      pressed.current.shiftPressed = false
      pressed.current.altPressed = false
    }

    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("keyup", onKeyUp, true)
    window.addEventListener("blur", reset)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("keyup", onKeyUp, true)
      window.removeEventListener("blur", reset)
      reset()
    }
  }, [active])

  return pressed
}
