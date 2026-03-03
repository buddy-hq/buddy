import type { HTMLAttributes, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react"
import "./resize-handle.css"

type ResizeHandleProps = Omit<HTMLAttributes<HTMLDivElement>, "onResize"> & {
  direction: "horizontal" | "vertical"
  edge?: "start" | "end"
  size: number
  min: number
  max: number
  onResize: (size: number) => void
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
    onCollapse,
    collapseThreshold,
    className,
    onMouseDown: onMouseDownProp,
    onTouchStart: onTouchStartProp,
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

    document.body.style.userSelect = "none"
    document.body.style.overflow = "hidden"

    const unsubscribe = subscribe((position) => {
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
      onResize(clamped)
    }, () => {
      document.body.style.userSelect = ""
      document.body.style.overflow = ""
      unsubscribe()

      const threshold = collapseThreshold ?? 0
      if (onCollapse && threshold > 0 && current < threshold) {
        onCollapse()
      }
    })
  }

  function onMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    onMouseDownProp?.(event)
    if (event.defaultPrevented || event.button !== 0) return
    event.preventDefault()

    const start = direction === "horizontal" ? event.clientX : event.clientY
    startResize(start, (onMove, onEnd) => {
      const onMouseMove = (moveEvent: MouseEvent) => {
        const position = direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY
        onMove(position)
      }

      const onMouseUp = () => {
        onEnd()
      }

      document.addEventListener("mousemove", onMouseMove)
      document.addEventListener("mouseup", onMouseUp)

      return () => {
        document.removeEventListener("mousemove", onMouseMove)
        document.removeEventListener("mouseup", onMouseUp)
      }
    })
  }

  function onTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    onTouchStartProp?.(event)
    if (event.defaultPrevented) return

    const touch = event.touches[0]
    if (!touch) return
    event.preventDefault()

    const touchID = touch.identifier
    const start = direction === "horizontal" ? touch.clientX : touch.clientY

    startResize(start, (onMove, onEnd) => {
      const onTouchMove = (moveEvent: TouchEvent) => {
        const nextTouch = Array.from(moveEvent.touches).find((entry) => entry.identifier === touchID)
        if (!nextTouch) return
        moveEvent.preventDefault()
        const position = direction === "horizontal" ? nextTouch.clientX : nextTouch.clientY
        onMove(position)
      }

      const onTouchEnd = (endEvent: TouchEvent) => {
        const touched = Array.from(endEvent.changedTouches).some((entry) => entry.identifier === touchID)
        if (!touched) return
        onEnd()
      }

      document.addEventListener("touchmove", onTouchMove, { passive: false })
      document.addEventListener("touchend", onTouchEnd)
      document.addEventListener("touchcancel", onTouchEnd)

      return () => {
        document.removeEventListener("touchmove", onTouchMove)
        document.removeEventListener("touchend", onTouchEnd)
        document.removeEventListener("touchcancel", onTouchEnd)
      }
    })
  }

  const edge = edgeProp ?? (direction === "vertical" ? "start" : "end")
  const handleClassName = className ? `buddy-resize-handle ${className}` : "buddy-resize-handle"

  return (
    <div
      {...domProps}
      data-component="resize-handle"
      data-direction={direction}
      data-edge={edge}
      className={handleClassName}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      style={style ? { ...style, touchAction: "none" } : { touchAction: "none" }}
    />
  )
}
