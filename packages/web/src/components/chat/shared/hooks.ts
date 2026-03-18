import { useState, useEffect, useRef } from "react"

const TEXT_RENDER_THROTTLE_MS = 100

export function useThrottledText(value: string) {
  const [throttled, setThrottled] = useState(value)
  const timeoutRef = useRef<number | undefined>(undefined)
  const lastRef = useRef(0)

  useEffect(() => {
    const now = Date.now()
    const remaining = TEXT_RENDER_THROTTLE_MS - (now - lastRef.current)

    if (remaining <= 0) {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = undefined
      }
      lastRef.current = now
      setThrottled(value)
      return
    }

    if (timeoutRef.current !== undefined) {
      window.clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = window.setTimeout(() => {
      lastRef.current = Date.now()
      setThrottled(value)
      timeoutRef.current = undefined
    }, remaining)

    return () => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = undefined
      }
    }
  }, [value])

  return throttled
}
