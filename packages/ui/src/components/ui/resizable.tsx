"use client"

import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@buddy/ui/lib/utils"

function ResizablePanelGroup({ className, ...props }: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn("flex h-full w-full aria-[orientation=vertical]:flex-col", className)}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  variant = "divider",
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
  variant?: "divider" | "overlay"
}) {
  const dividerClassName =
    "bg-border-base focus-visible:ring-border-interactive-base ring-offset-background-base relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90"
  const overlayClassName =
    "relative z-10 flex items-center justify-center overflow-visible bg-transparent focus-visible:ring-border-interactive-base focus-visible:outline-hidden focus-visible:ring-1 data-[separator=hover]:after:opacity-100 data-[separator=active]:after:opacity-100 after:absolute after:content-[''] after:opacity-0 after:transition-opacity after:duration-150 after:ease-in-out after:bg-[color-mix(in_oklab,var(--text-weak)_45%,transparent)] w-0 after:inset-y-0 after:left-1/2 after:w-[3px] after:-translate-x-1/2 aria-[orientation=horizontal]:h-0 aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:top-1/2 aria-[orientation=horizontal]:after:h-[3px] aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:-translate-y-1/2 aria-[orientation=horizontal]:after:translate-x-0"

  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(variant === "overlay" ? overlayClassName : dividerClassName, className)}
      {...props}
    >
      {withHandle && <div className="bg-border-base h-6 w-1 rounded-lg z-10 flex shrink-0" />}
    </ResizablePrimitive.Separator>
  )
}

const useResizablePanelRef = ResizablePrimitive.usePanelRef

type ResizablePanelHandle = ResizablePrimitive.PanelImperativeHandle

export { ResizableHandle, ResizablePanel, ResizablePanelGroup, useResizablePanelRef }
export type { ResizablePanelHandle }
