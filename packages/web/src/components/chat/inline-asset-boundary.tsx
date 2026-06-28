import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { cn } from "@buddy/ui"
import { useChatScrollViewport } from "./chat-scroll-context"

const INLINE_ASSET_ACTIVATION_ROOT_MARGIN_PX = 900
const INLINE_ASSET_SIZE_CHANGE_THRESHOLD_PX = 0.5

export type InlineAssetActivation = {
  active: boolean
  ref: RefObject<HTMLDivElement>
}

export type InlineAssetSize = {
  width: number
  height: number
}

export type InlineAssetLifecycle = {
  onContentReady?: () => void
  onSizeChange?: (size: InlineAssetSize) => void
}

const InlineAssetLifecycleContext = createContext<InlineAssetLifecycle | undefined>(undefined)

export function InlineAssetLifecycleProvider(props: {
  value: InlineAssetLifecycle
  children: ReactNode
}): ReactNode {
  return (
    <InlineAssetLifecycleContext.Provider value={props.value}>
      {props.children}
    </InlineAssetLifecycleContext.Provider>
  )
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

export function useInlineAssetLifecycleReporter<TElement extends HTMLElement>(input: {
  ref: RefObject<TElement | null>
  active: boolean
  onContentReady?: () => void
  onSizeChange?: (size: InlineAssetSize) => void
}) {
  const lifecycle = useContext(InlineAssetLifecycleContext)
  const readyRef = useRef(false)
  const lastSizeRef = useRef<InlineAssetSize | undefined>(undefined)
  const onContentReady = input.onContentReady ?? lifecycle?.onContentReady
  const onSizeChange = input.onSizeChange ?? lifecycle?.onSizeChange

  useEffect(() => {
    if (!input.active || readyRef.current) return
    readyRef.current = true
    onContentReady?.()
  }, [input.active, onContentReady])

  useEffect(() => {
    if (!input.active || !onSizeChange) return
    const element = input.ref.current
    if (!element) return

    const notify = () => {
      const rect = element.getBoundingClientRect()
      const next = {
        width: rect.width,
        height: rect.height,
      }
      const previous = lastSizeRef.current
      if (
        previous &&
        Math.abs(previous.width - next.width) < INLINE_ASSET_SIZE_CHANGE_THRESHOLD_PX &&
        Math.abs(previous.height - next.height) < INLINE_ASSET_SIZE_CHANGE_THRESHOLD_PX
      ) {
        return
      }
      lastSizeRef.current = next
      onSizeChange(next)
    }

    notify()
    if (typeof ResizeObserver === "undefined") {
      return
    }

    const observer = new ResizeObserver(notify)
    observer.observe(element)
    return () => observer.disconnect()
  }, [input.active, input.ref, onSizeChange])
}

export function InlineAssetBoundary(props: {
  children: ReactNode
  fallback?: ReactNode
  className?: string
  rootMarginPx?: number
  onContentReady?: () => void
  onSizeChange?: (size: InlineAssetSize) => void
}): ReactNode {
  const activation = useInlineAssetActivation({ rootMarginPx: props.rootMarginPx })
  useInlineAssetLifecycleReporter({
    ref: activation.ref,
    active: activation.active,
    onContentReady: props.onContentReady,
    onSizeChange: props.onSizeChange,
  })

  return (
    <div ref={activation.ref} className={cn("min-w-0", props.className)}>
      {activation.active ? props.children : props.fallback}
    </div>
  )
}
