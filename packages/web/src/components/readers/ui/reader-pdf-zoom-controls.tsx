import { FitToScreenIcon, ZoomInIcon, ZoomOutIcon } from "@/icons/app-icons"
import { ReaderToolbarButton } from "./reader-toolbar-button"

type ReaderPdfZoomControlsProps = {
  onZoomOut: () => void
  onFit: () => void
  onZoomIn: () => void
}

export function ReaderPdfZoomControls({ onZoomOut, onFit, onZoomIn }: ReaderPdfZoomControlsProps) {
  return (
    <div role="group" aria-label="Zoom" className="flex shrink-0 items-center">
      <ReaderToolbarButton icon={ZoomOutIcon} label="Zoom out  ⌘−" onClick={onZoomOut} />
      <ReaderToolbarButton icon={FitToScreenIcon} label="Fit the page  ⌘0" onClick={onFit} />
      <ReaderToolbarButton icon={ZoomInIcon} label="Zoom in  ⌘+" onClick={onZoomIn} />
    </div>
  )
}
