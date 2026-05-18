import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { cn } from "@buddy/ui"
import { useChatScrollViewport } from "./chat-scroll-context"

const INLINE_ASSET_ACTIVATION_ROOT_MARGIN_PX = 900

export type InlineAssetActivation = {
  active: boolean
  ref: RefObject<HTMLDivElement>
}

export function useInlineAssetActivation(options?: {
  rootMarginPx?: number
}): InlineAssetActivation {
  const scrollViewportRef = useChatScrollViewport()
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (active) {
      return
    }

    const root = scrollViewportRef?.current
    const element = ref.current
    if (!(element instanceof HTMLDivElement)) {
      return
    }
    if (!(root instanceof HTMLElement) || typeof IntersectionObserver === "undefined") {
      setActive(true)
      return
    }

    const rootMarginPx = options?.rootMarginPx ?? INLINE_ASSET_ACTIVATION_ROOT_MARGIN_PX
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return
        }
        setActive(true)
        observer.disconnect()
      },
      {
        root,
        rootMargin: `${rootMarginPx}px 0px ${rootMarginPx}px 0px`,
      },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [active, options?.rootMarginPx, scrollViewportRef])

  return { active, ref }
}

export function InlineAssetBoundary(props: {
  children: ReactNode
  fallback?: ReactNode
  className?: string
  rootMarginPx?: number
}): ReactNode {
  const activation = useInlineAssetActivation({ rootMarginPx: props.rootMarginPx })

  return (
    <div ref={activation.ref} className={cn("min-w-0", props.className)}>
      {activation.active ? props.children : props.fallback}
    </div>
  )
}
