import { motion, AnimatePresence } from "motion/react"
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  cn,
} from "@buddy/ui"
import { ShrinkIcon } from "lucide-react"
import { useCallback, useEffect } from "react"
import { useDesktopTitlebarInset } from "@/components/layout/desktop-titlebar-inset"
import { language } from "@/context/language"
import { mermaidConstants } from "./constants"
import type { MermaidRenderResult } from "./lib/render"
import { MODAL_EXPAND_SPRING } from "./motion"
import {
  useMermaidViewport,
  type MermaidViewportSize,
  type MermaidViewportZoomState,
} from "./use-mermaid-viewport"

type MermaidFullscreenDialogProps = {
  value: MermaidRenderResult | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  alt: string
  zoomState: MermaidViewportZoomState
  onZoomStateChange: (state: MermaidViewportZoomState) => void
}

export function MermaidFullscreenDialog({
  value,
  open,
  onOpenChange,
  alt,
  zoomState,
  onZoomStateChange,
}: MermaidFullscreenDialogProps) {
  const titlebarInset = useDesktopTitlebarInset(open)
  const fullscreenViewport = useMermaidViewport({
    value,
    enabled: open,
    zoomState,
    onZoomStateChange,
    canvasPadding: mermaidConstants.viewport.FULLSCREEN_CANVAS_PADDING,
    panOverscan: mermaidConstants.viewport.FULLSCREEN_PAN_OVERSCAN,
    defaultZoomMode: "responsive",
    mountSvg: false,
    responsiveAutoZoomStrategy: {
      minimumRenderedHeight: mermaidConstants.viewport.FULLSCREEN_AUTO_MIN_RENDERED_HEIGHT,
      maxViewportWidths: mermaidConstants.viewport.FULLSCREEN_AUTO_MAX_VIEWPORT_WIDTHS,
    },
    getFitPadding: useCallback((viewport: MermaidViewportSize) => {
      return {
        horizontal:
          viewport.width >= mermaidConstants.viewport.BREAKPOINT_MD
            ? mermaidConstants.viewport.FULLSCREEN_PADDING_MD_X
            : mermaidConstants.viewport.FULLSCREEN_PADDING_SM_X,
        vertical: mermaidConstants.viewport.FULLSCREEN_PADDING_BOTTOM,
      }
    }, []),
  })

  useEffect(() => {
    if (!open || value === undefined || !fullscreenViewport.svgHostRef.current) {
      return
    }

    value.bindFunctions?.(fullscreenViewport.svgHostRef.current)
  }, [fullscreenViewport.svgHostRef, open, value])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogContent
            forceMount
            showCloseButton={false}
            className="dark fixed inset-0 top-0 left-0 z-[60] h-[100dvh] w-[100vw] max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden border-0 bg-transparent p-0 ring-0 sm:max-w-none data-[state=open]:animate-none data-[state=closed]:animate-none"
          >
            <DialogHeader className="sr-only">
              <DialogTitle>{alt}</DialogTitle>
              <DialogDescription>
                {language.t("chatTools.mermaidDiagram.fullscreenDescription")}
              </DialogDescription>
            </DialogHeader>

            <motion.div
              transition={MODAL_EXPAND_SPRING}
              className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-base"
              style={titlebarInset > 0 ? { paddingTop: titlebarInset } : undefined}
            >
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:40px_40px] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)]" />

              <motion.header
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ ...MODAL_EXPAND_SPRING, delay: 0.1 }}
                className="relative z-20 flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-4 md:px-6 md:pt-6"
              >
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-text-strong md:text-lg">
                  {alt}
                </p>
                <DialogClose asChild>
                  <Button
                    type="button"
                    data-action="mermaid-close-fullscreen"
                    size="sm"
                    variant="ghost"
                    className="h-10 w-10 shrink-0 rounded-xl border border-border-base/60 bg-surface-base/90 shadow-lg backdrop-blur-md [-webkit-app-region:no-drag]"
                    aria-label={language.t("chatTools.mermaidDiagram.closeFullscreenAria")}
                  >
                    <ShrinkIcon className="size-5" />
                  </Button>
                </DialogClose>
              </motion.header>

              {value === undefined ? (
                <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-sm text-text-weak">
                  {language.t("chatTools.mermaidDiagram.rendering")}
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={MODAL_EXPAND_SPRING}
                  ref={fullscreenViewport.viewportRef}
                  data-component="mermaid-diagram-fullscreen-viewport"
                  className={cn(
                    "no-scrollbar relative z-0 min-h-0 flex-1 overflow-auto px-5 pb-24 md:px-8",
                    fullscreenViewport.isDragging ? "cursor-grabbing select-none" : "cursor-grab",
                  )}
                  onPointerDown={fullscreenViewport.handlePointerDown}
                >
                  <div
                    className="relative overflow-visible"
                    style={{
                      width: fullscreenViewport.canvasWidth,
                      height: fullscreenViewport.canvasHeight,
                    }}
                  >
                    <div
                      ref={fullscreenViewport.svgHostRef}
                      data-component="mermaid-diagram-fullscreen"
                      role="img"
                      aria-label={`${alt} ${language.t("chatTools.mermaidDiagram.fullscreenAriaSuffix")}`}
                      className="absolute flex shrink-0 items-start justify-start [&_svg]:!block [&_svg]:!h-full [&_svg]:!w-full [&_svg]:!max-w-none"
                      style={{
                        left: fullscreenViewport.contentOffsetX,
                        top: fullscreenViewport.contentOffsetY,
                        width: fullscreenViewport.renderedWidth,
                        height: fullscreenViewport.renderedHeight,
                        padding: mermaidConstants.viewport.FULLSCREEN_CANVAS_PADDING,
                      }}
                      dangerouslySetInnerHTML={{ __html: value.svg }}
                    />
                  </div>
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ ...MODAL_EXPAND_SPRING, delay: 0.1 }}
                className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-6 md:pb-8"
              >
                <div
                  data-component="mermaid-fullscreen-controls"
                  className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-border-base/60 bg-surface-base/90 p-1.5 shadow-lg backdrop-blur-md [-webkit-app-region:no-drag]"
                >
                  <Button
                    type="button"
                    data-action="mermaid-zoom-out"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 rounded-lg"
                    aria-label={language.t("chatTools.mermaidDiagram.zoomOutAria")}
                    onClick={fullscreenViewport.zoomOut}
                    disabled={!fullscreenViewport.canZoomOut}
                  >
                    -
                  </Button>
                  <div
                    data-component="mermaid-fullscreen-zoom-level"
                    className="min-w-[3.5rem] px-2 text-center text-[13px] font-medium text-text-strong"
                    aria-label={language.t("chatTools.mermaidDiagram.zoomLevelAria")}
                  >
                    {fullscreenViewport.isAutoZoom
                      ? language.t("chatTools.mermaidDiagram.auto")
                      : fullscreenViewport.zoomLabel}
                  </div>
                  <Button
                    type="button"
                    data-action="mermaid-zoom-in"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 rounded-lg"
                    aria-label={language.t("chatTools.mermaidDiagram.zoomInAria")}
                    onClick={fullscreenViewport.zoomIn}
                    disabled={!fullscreenViewport.canZoomIn}
                  >
                    +
                  </Button>
                  <div className="mx-1 h-4 w-px bg-border-base/50" />
                  <Button
                    type="button"
                    data-action="mermaid-auto"
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-lg px-3 text-[13px]"
                    aria-label={language.t("chatTools.mermaidDiagram.resetZoomAria")}
                    onClick={fullscreenViewport.resetZoom}
                  >
                    {language.t("chatTools.mermaidDiagram.auto")}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          </DialogContent>
        )}
      </AnimatePresence>
    </Dialog>
  )
}
