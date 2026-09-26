import { useLayoutEffect, useRef } from "react"
import { hostedBrowserKey, useHostedBrowserStore } from "@/state/hosted-browser-store"

/** Measures the Bench page area without moving its hosted Electron webview. */
export function BrowserSurfaceSlot(props: { directory: string; tabID: string; visible: boolean }) {
  const elementRef = useRef<HTMLDivElement>(null)
  const presentationRef = useRef(props.visible)
  const updateRef = useRef<(() => void) | null>(null)
  const key = hostedBrowserKey(props.directory, props.tabID)

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element) return
    const owner = Symbol(key)
    const store = useHostedBrowserStore.getState()
    store.claimSurface(key, owner)
    const drawerHost = element.closest(
      '[data-component="right-workspace-bench-target"]',
    )?.parentElement
    const observer = new ResizeObserver(() => update())
    let observedDrawer: Element | null = null
    let drawerAnimationFrame: number | null = null
    const trackDrawerAnimation = (startedAt: number) => {
      if (drawerAnimationFrame !== null) cancelAnimationFrame(drawerAnimationFrame)
      const tick = (now: number) => {
        update()
        drawerAnimationFrame = now - startedAt < 200 ? requestAnimationFrame(tick) : null
      }
      drawerAnimationFrame = requestAnimationFrame(tick)
    }
    const update = () => {
      const rect = element.getBoundingClientRect()
      const drawer =
        drawerHost?.querySelector('[data-component="right-workspace-selector-drawer"]') ?? null
      if (drawer !== observedDrawer) {
        if (observedDrawer) observer.unobserve(observedDrawer)
        if (drawer) observer.observe(drawer)
        observedDrawer = drawer
        if (drawer && presentationRef.current) trackDrawerAnimation(performance.now())
      }
      const drawerRect = drawer?.getBoundingClientRect()
      const clipRight =
        drawerRect && drawerRect.top < rect.bottom && drawerRect.bottom > rect.top
          ? Math.max(
              0,
              Math.min(rect.right, drawerRect.right) - Math.max(rect.left, drawerRect.left),
            )
          : 0
      const bounds = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      }
      store.presentSurface(
        key,
        owner,
        bounds,
        presentationRef.current && rect.width > 0 && rect.height > 0,
        Math.round(clipRight),
      )
    }
    const updateOnScroll = (event: Event) => {
      if (event.target instanceof Node && event.target.contains(element)) update()
    }
    updateRef.current = update
    update()
    observer.observe(element)
    if (drawerHost) observer.observe(drawerHost)
    const drawerObserver = drawerHost ? new MutationObserver(update) : undefined
    if (drawerHost) drawerObserver?.observe(drawerHost, { childList: true })
    window.addEventListener("resize", update)
    window.addEventListener("scroll", updateOnScroll, true)
    return () => {
      observer.disconnect()
      if (drawerAnimationFrame !== null) cancelAnimationFrame(drawerAnimationFrame)
      drawerObserver?.disconnect()
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", updateOnScroll, true)
      if (updateRef.current === update) updateRef.current = null
      useHostedBrowserStore.getState().releaseSurface(key, owner)
    }
  }, [key])

  useLayoutEffect(() => {
    presentationRef.current = props.visible
    updateRef.current?.()
  }, [props.visible])

  return <div ref={elementRef} className="h-full min-h-0 w-full" data-browser-surface-slot={key} />
}
