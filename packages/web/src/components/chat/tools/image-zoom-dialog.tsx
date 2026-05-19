import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Slider,
} from "@buddy/ui"
import { ZoomInIcon, ZoomOutIcon } from "lucide-react"

const IMAGE_DIALOG_MIN_SCALE = 0.25
const IMAGE_DIALOG_MAX_SCALE = 3.0
const IMAGE_DIALOG_SCALE_STEP = 0.1
const IMAGE_DIALOG_FIT_SCALE = 1.0

interface ImageZoomDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageUrl: string
  title: string
  description?: string
  children?: React.ReactNode
}

export function ImageZoomDialog({
  open,
  onOpenChange,
  imageUrl,
  title,
  description,
  children,
}: ImageZoomDialogProps) {
  const [scale, setScale] = useState(IMAGE_DIALOG_FIT_SCALE)

  useEffect(() => {
    if (open) {
      setScale(IMAGE_DIALOG_FIT_SCALE)
    }
  }, [open, imageUrl])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!border-none !bg-transparent !shadow-none p-0 flex flex-col gap-4 sm:max-w-[90vw] md:max-w-[85vw] max-h-[90vh] w-full focus:outline-none"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-4 flex flex-col items-center justify-center w-full h-full">
          {/* Header Floating Controls */}
          <div className="flex items-center justify-between w-full max-w-xl px-4 py-2 bg-background-base/75 backdrop-blur-sm rounded-full border border-border-base/10 shadow-lg text-xs text-text-weak select-none">
            <span className="font-semibold truncate max-w-40 text-text-base mr-2">{title}</span>
            <div className="flex items-center gap-2">
              <Button
                size="xs"
                variant="ghost"
                className="hover:bg-surface-weak/20 px-2 py-1 h-auto"
                onClick={() => setScale(IMAGE_DIALOG_FIT_SCALE)}
              >
                Fit
              </Button>
              <Button
                size="xs"
                variant="ghost"
                className="hover:bg-surface-weak/20 px-2 py-1 h-auto"
                onClick={() => setScale(1)}
              >
                1:1
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                className="hover:bg-surface-weak/20 size-6"
                onClick={() =>
                  setScale((c) => Math.max(c - IMAGE_DIALOG_SCALE_STEP, IMAGE_DIALOG_MIN_SCALE))
                }
              >
                <ZoomOutIcon className="size-3" />
                <span className="sr-only">Zoom out</span>
              </Button>
              <div className="min-w-20 max-w-28 flex-1 px-1">
                <Slider
                  value={[scale]}
                  min={IMAGE_DIALOG_MIN_SCALE}
                  max={IMAGE_DIALOG_MAX_SCALE}
                  step={IMAGE_DIALOG_SCALE_STEP}
                  onValueChange={(v) => setScale(v[0] ?? IMAGE_DIALOG_FIT_SCALE)}
                />
              </div>
              <span className="tabular-nums">{Math.round(scale * 100)}%</span>
              <Button
                size="icon-xs"
                variant="ghost"
                className="hover:bg-surface-weak/20 size-6"
                onClick={() =>
                  setScale((c) => Math.min(c + IMAGE_DIALOG_SCALE_STEP, IMAGE_DIALOG_MAX_SCALE))
                }
              >
                <ZoomInIcon className="size-3" />
                <span className="sr-only">Zoom in</span>
              </Button>
            </div>
          </div>

          {/* Floating Image Viewport */}
          <figure className="overflow-auto rounded-xl border-none bg-transparent flex-1 w-full flex items-center justify-center p-0 max-h-[70vh] focus-visible:outline-none">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={title}
                loading="lazy"
                className="w-full h-full max-h-[70vh] max-w-[75vw] object-contain rounded-xl shadow-2xl select-none"
                style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}
              />
            ) : null}
          </figure>

          {/* Extra children contents */}
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}
