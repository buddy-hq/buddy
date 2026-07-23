import { createPortal } from "react-dom"
import type { CSSProperties, ReactNode } from "react"

export const FOLIATE_FLOATING_OVERLAY_Z_INDEX = 60

type FoliateFloatingOverlayProps = {
  anchorRoot: HTMLElement | null
  x: number
  y: number
  className: string
  dataComponent: string
  children: ReactNode
}

export function FoliateFloatingOverlay(props: FoliateFloatingOverlayProps) {
  const anchorRect = props.anchorRoot?.getBoundingClientRect()
  const style: CSSProperties = {
    left: `${(anchorRect?.left ?? 0) + props.x}px`,
    position: props.anchorRoot ? "fixed" : "absolute",
    top: `${(anchorRect?.top ?? 0) + props.y}px`,
    zIndex: FOLIATE_FLOATING_OVERLAY_Z_INDEX,
  }
  const element = (
    <div data-component={props.dataComponent} className={props.className} style={style}>
      {props.children}
    </div>
  )

  if (!props.anchorRoot) {
    return element
  }

  return createPortal(element, props.anchorRoot)
}
