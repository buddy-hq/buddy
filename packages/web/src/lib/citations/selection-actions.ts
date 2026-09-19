export type SelectionActionPoint = { x: number; y: number }

const MULTI_CLICK_INTERVAL_MS = 500

/** Observe completed mouse and keyboard selections without breaking native multi-click behavior. */
export function observeSelectionActions(input: {
  element: HTMLElement
  getActionElement?: () => HTMLElement | null
  onSelection: (pointer: SelectionActionPoint | null) => void
  onDismiss: () => void
}) {
  const document = input.element.ownerDocument
  const view = document.defaultView
  if (!view) return { selectionChanged() {}, dispose() {} }
  let pointerDown = false
  let gestureActive = false
  let dismissed = false
  let pointer: SelectionActionPoint | null = null
  let timer: number | undefined
  let frame: number | undefined
  const isActionTarget = (target: EventTarget | null) =>
    target instanceof view.Node && (input.getActionElement?.()?.contains(target) ?? false)
  const cancelPending = () => {
    if (timer !== undefined) view.clearTimeout(timer)
    if (frame !== undefined) view.cancelAnimationFrame(frame)
    timer = undefined
    frame = undefined
  }
  const cancel = () => {
    cancelPending()
    pointerDown = false
    gestureActive = false
    pointer = null
    dismissed = true
  }
  const dismiss = () => {
    cancel()
    input.onDismiss()
  }
  const schedule = (delay: number) => {
    cancelPending()
    timer = view.setTimeout(() => {
      timer = undefined
      frame = view.requestAnimationFrame(() => {
        frame = undefined
        input.onSelection(pointer)
      })
    }, delay)
  }
  const onPointerDown = (event: PointerEvent) => {
    if (!event.isPrimary) return
    if (isActionTarget(event.target)) {
      cancel()
      return
    }
    cancelPending()
    pointerDown = event.button === 0
    const inside = event.target instanceof view.Node && input.element.contains(event.target)
    gestureActive = false
    dismissed = true
    pointer = null
    if (inside) input.onDismiss()
  }
  const onSelectionStart = (event: PointerEvent) => {
    if (!event.isPrimary) return
    gestureActive = event.button === 0 && !event.defaultPrevented
    dismissed = !gestureActive
  }
  const onPointerUp = (event: PointerEvent) => {
    if (event.isPrimary && event.button === 0) pointerDown = false
  }
  const onMouseUp = (event: MouseEvent) => {
    if (event.button !== 0) return
    pointerDown = false
    if (!gestureActive) return
    gestureActive = false
    pointer = { x: event.clientX, y: event.clientY }
    schedule(event.detail >= 2 ? MULTI_CLICK_INTERVAL_MS : 0)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (isActionTarget(event.target) && event.key !== "Escape") return
    if (event.key === "Escape") dismiss()
    else if (!pointerDown) {
      cancelPending()
      gestureActive = false
      pointer = null
      dismissed = false
    }
  }
  const onSelectionChange = () => {
    if (isActionTarget(document.activeElement)) return
    if (pointerDown || gestureActive) input.onDismiss()
    else if (!dismissed && timer === undefined && frame === undefined) schedule(0)
  }
  const onScroll = () => {
    cancelPending()
    if (!pointerDown) {
      pointer = null
      dismissed = true
    }
    input.onDismiss()
  }

  document.addEventListener("pointerdown", onPointerDown, true)
  input.element.addEventListener("pointerdown", onSelectionStart)
  view.addEventListener("pointerup", onPointerUp)
  view.addEventListener("mouseup", onMouseUp)
  document.addEventListener("keydown", onKeyDown)
  document.addEventListener("selectionchange", onSelectionChange)
  input.element.addEventListener("scroll", onScroll, true)
  view.addEventListener("blur", dismiss)
  view.addEventListener("resize", dismiss)
  return {
    selectionChanged: onSelectionChange,
    dispose() {
      cancel()
      document.removeEventListener("pointerdown", onPointerDown, true)
      input.element.removeEventListener("pointerdown", onSelectionStart)
      view.removeEventListener("pointerup", onPointerUp)
      view.removeEventListener("mouseup", onMouseUp)
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("selectionchange", onSelectionChange)
      input.element.removeEventListener("scroll", onScroll, true)
      view.removeEventListener("blur", dismiss)
      view.removeEventListener("resize", dismiss)
    },
  }
}
