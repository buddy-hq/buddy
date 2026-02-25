import type { HTMLAttributes, MouseEvent as ReactMouseEvent } from "react"
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
    ...domProps
  } = props

  function onMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    onMouseDownProp?.(event)
    if (event.defaultPrevented) return
    event.preventDefault()

    const edge = edgeProp ?? (direction === "vertical" ? "start" : "end")
    const start = direction === "horizontal" ? event.clientX : event.clientY
    const startSize = size
    let current = startSize

    document.body.style.userSelect = "none"
    document.body.style.overflow = "hidden"

    const onMouseMove = (moveEvent: MouseEvent) => {
      const position = direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY
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
    }

    const onMouseUp = () => {
      document.body.style.userSelect = ""
      document.body.style.overflow = ""
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)

      const threshold = collapseThreshold ?? 0
      if (onCollapse && threshold > 0 && current < threshold) {
        onCollapse()
      }
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
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
    />
  )
}
