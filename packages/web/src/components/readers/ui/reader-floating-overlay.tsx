import { createPortal } from "react-dom"
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react"
import { Z_INDEX } from "@buddy/ui"

export const READER_FLOATING_OVERLAY_Z_INDEX = Z_INDEX.floating
export const READER_FLOATING_OVERLAY_ANCHOR_OFFSET_PROPERTY =
  "--reader-floating-overlay-anchor-offset-x"

const READER_FLOATING_OVERLAY_BOUNDARY_PADDING_PX = 8

type ReaderFloatingOverlayProps = {
  anchorRoot: HTMLElement | null
  x: number
  y: number
  className: string
  dataComponent: string
  children: ReactNode
}

export function ReaderFloatingOverlay(props: ReaderFloatingOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const style: CSSProperties = {
    left: `${props.x}px`,
    position: "absolute",
    top: `${props.y}px`,
    zIndex: READER_FLOATING_OVERLAY_Z_INDEX,
  }

  useLayoutEffect(() => {
    const overlay = overlayRef.current
    const anchorRoot = props.anchorRoot
    if (!overlay || !anchorRoot) return

    const alignToBoundary = () => {
      const rootBounds = anchorRoot.getBoundingClientRect()
      const overlayBounds = overlay.getBoundingClientRect()
      if (overlayBounds.width <= 0) return
      const ownerWindow = anchorRoot.ownerDocument.defaultView
      const viewportLeft = ownerWindow?.visualViewport?.offsetLeft ?? 0
      const viewportRight =
        viewportLeft +
        (ownerWindow?.visualViewport?.width ?? ownerWindow?.innerWidth ?? rootBounds.right)
      const boundaryLeft =
        Math.max(rootBounds.left, viewportLeft) + READER_FLOATING_OVERLAY_BOUNDARY_PADDING_PX
      const boundaryRight =
        Math.min(rootBounds.right, viewportRight) - READER_FLOATING_OVERLAY_BOUNDARY_PADDING_PX
      const currentAdjustment = Number.parseFloat(overlay.style.marginLeft) || 0
      const baseLeft = overlayBounds.left - currentAdjustment
      const baseRight = overlayBounds.right - currentAdjustment
      const availableWidth = Math.max(0, boundaryRight - boundaryLeft)
      let nextAdjustment = 0

      if (overlayBounds.width > availableWidth || baseLeft < boundaryLeft) {
        nextAdjustment = boundaryLeft - baseLeft
      } else if (baseRight > boundaryRight) {
        nextAdjustment = boundaryRight - baseRight
      }

      overlay.style.marginLeft = `${nextAdjustment}px`
      overlay.style.setProperty(
        READER_FLOATING_OVERLAY_ANCHOR_OFFSET_PROPERTY,
        `${-nextAdjustment}px`,
      )
    }

    alignToBoundary()
    const ownerWindow = anchorRoot.ownerDocument.defaultView
    ownerWindow?.addEventListener("resize", alignToBoundary)
    const resizeObserver = ownerWindow?.ResizeObserver
      ? new ownerWindow.ResizeObserver(alignToBoundary)
      : undefined
    resizeObserver?.observe(anchorRoot)
    resizeObserver?.observe(overlay)
    return () => {
      ownerWindow?.removeEventListener("resize", alignToBoundary)
      resizeObserver?.disconnect()
    }
  }, [props.anchorRoot, props.x, props.y])

  const element = (
    <div
      ref={overlayRef}
      data-component={props.dataComponent}
      className={props.className}
      style={style}
    >
      {props.children}
    </div>
  )

  if (!props.anchorRoot) {
    return element
  }

  return createPortal(element, props.anchorRoot)
}
