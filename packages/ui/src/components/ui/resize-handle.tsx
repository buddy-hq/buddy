import type { HTMLAttributes, PointerEvent as ReactPointerEvent } from "react"

const NOOP = () => undefined

export type ResizeHandleIntent = {
  rawSize: number
  clampedSize: number
  min: number
  max: number
}

type ResizeHandleProps = Omit<HTMLAttributes<HTMLDivElement>, "onResize"> & {
  direction: "horizontal" | "vertical"
  edge?: "start" | "end"
  size: number
  min: number
  max: number
  onResize: (size: number) => void
  onResizeIntent?: (intent: ResizeHandleIntent) => void
  onCollapse?: () => void
  collapseThreshold?: number
}

export function ResizeHandle(props: ResizeHandleProps) {
  const {
    direction,
    edge: edgeProp,
    size,
    min,
    max,
    onResize,
    onResizeIntent,
    onCollapse,
    collapseThreshold,
    className,
    onPointerDown: onPointerDownProp,
    style,
    ...domProps
  } = props

  function startResize(
    start: number,
    subscribe: (onMove: (position: number) => void, onEnd: () => void) => () => void,
  ) {
    const edge = edgeProp ?? (direction === "vertical" ? "start" : "end")
    const startSize = size
    let current = startSize
    let finished = false
    let pendingIntent: ResizeHandleIntent | undefined
    let resizeFrameID: number | undefined
    const previousUserSelect = document.body.style.userSelect
    const previousOverflow = document.body.style.overflow

    document.body.style.userSelect = "none"
    document.body.style.overflow = "hidden"

    let unsubscribe: () => void = NOOP

    const flushPendingResize = () => {
      resizeFrameID = undefined
      const intent = pendingIntent
      pendingIntent = undefined
      if (!intent) return
      onResize(intent.clampedSize)
      onResizeIntent?.(intent)
    }

    const scheduleResize = (intent: ResizeHandleIntent) => {
      pendingIntent = intent
      if (resizeFrameID !== undefined) return
      if (typeof globalThis.requestAnimationFrame !== "function") {
        flushPendingResize()
        return
      }
      resizeFrameID = globalThis.requestAnimationFrame(flushPendingResize)
    }

    const finishResize = () => {
      if (finished) return
      finished = true
      if (resizeFrameID !== undefined && typeof globalThis.cancelAnimationFrame === "function") {
        globalThis.cancelAnimationFrame(resizeFrameID)
      }
      flushPendingResize()
      document.body.style.userSelect = previousUserSelect
      document.body.style.overflow = previousOverflow
      unsubscribe()

      const threshold = collapseThreshold ?? 0
      if (onCollapse && threshold > 0 && current < threshold) {
        onCollapse()
      }
    }

    unsubscribe = subscribe((position: number) => {
      const delta =
        direction === "vertical"
          ? edge === "end"
            ? position - start
            : start - position
          : edge === "start"
            ? start - position
            : position - start

      current = startSize + delta
      const clamped = Math.min(max, Math.max(min, current))
      scheduleResize({
        rawSize: current,
        clampedSize: clamped,
        min,
        max,
      })
    }, finishResize)
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    onPointerDownProp?.(event)
    if (event.defaultPrevented) return
    if (event.pointerType === "mouse" && event.button !== 0) return
    event.preventDefault()

    const handle = event.currentTarget
    const pointerID = event.pointerId
    handle.setPointerCapture(pointerID)

    const start = direction === "horizontal" ? event.clientX : event.clientY

    startResize(start, (onMove, onEnd) => {
      const onPointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerID) return
        const position = direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY
        onMove(position)
      }

      const finishPointerResize = (nextEvent: PointerEvent) => {
        if (nextEvent.pointerId !== pointerID) return
        onEnd()
      }

      const onWindowBlur = () => {
        onEnd()
      }

      handle.addEventListener("pointermove", onPointerMove)
      handle.addEventListener("pointerup", finishPointerResize)
      handle.addEventListener("pointercancel", finishPointerResize)
      handle.addEventListener("lostpointercapture", onEnd)
      window.addEventListener("blur", onWindowBlur)

      return () => {
        handle.removeEventListener("pointermove", onPointerMove)
        handle.removeEventListener("pointerup", finishPointerResize)
        handle.removeEventListener("pointercancel", finishPointerResize)
        handle.removeEventListener("lostpointercapture", onEnd)
        window.removeEventListener("blur", onWindowBlur)
        if (handle.hasPointerCapture(pointerID)) {
          handle.releasePointerCapture(pointerID)
        }
      }
    })
  }

  const edge = edgeProp ?? (direction === "vertical" ? "start" : "end")
  const handleClassName = [
    "absolute z-10 after:absolute after:content-[''] after:opacity-0 after:transition-opacity after:duration-150 after:ease-in-out after:bg-[color-mix(in_oklab,var(--text-weak)_45%,transparent)] hover:after:opacity-100 active:after:opacity-100",
    direction === "horizontal"
      ? edge === "start"
        ? "inset-y-0 left-0 w-2 -translate-x-1/2 cursor-col-resize after:inset-y-0 after:left-1/2 after:w-[3px] after:-translate-x-1/2"
        : "inset-y-0 right-0 w-2 translate-x-1/2 cursor-col-resize after:inset-y-0 after:left-1/2 after:w-[3px] after:-translate-x-1/2"
      : edge === "end"
        ? "inset-x-0 bottom-0 h-2 translate-y-1/2 cursor-row-resize after:inset-x-0 after:top-1/2 after:h-[3px] after:-translate-y-1/2"
        : "inset-x-0 top-0 h-2 -translate-y-1/2 cursor-row-resize after:inset-x-0 after:top-1/2 after:h-[3px] after:-translate-y-1/2",
    className,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div
      {...domProps}
      className={handleClassName}
      onPointerDown={onPointerDown}
      style={style ? { ...style, touchAction: "none" } : { touchAction: "none" }}
    />
  )
}
