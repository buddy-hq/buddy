import { diagnosticLog, isDiagnosticLogEnabled } from "@/lib/diagnostic-log"

export const BENCH_TOGGLE_DIAGNOSTIC_CHANNEL = "bench-toggle"

type ElementDiagnosticInfo = {
  tag: string
  action: string | null
  component: string | null
  titlebarNoDrag: boolean
  ariaExpanded: string | null
  ariaLabel: string | null
}

type DomEventDiagnostic = {
  type: string
  button: number | null
  buttons: number | null
  clientX: number | null
  clientY: number | null
  defaultPrevented: boolean
  eventPhase: number
  target: ElementDiagnosticInfo | null
  currentTarget: ElementDiagnosticInfo | null
}

type DiagnosticEventLike = {
  type: string
  button?: number
  buttons?: number
  clientX?: number
  clientY?: number
  defaultPrevented: boolean
  eventPhase: number
  target: EventTarget | null
  currentTarget: EventTarget | null
}

function closestAttributeValue(element: Element, selector: string, attribute: string): string | null {
  return element.closest(selector)?.getAttribute(attribute) ?? null
}

function elementInfo(target: EventTarget | null): ElementDiagnosticInfo | null {
  if (!(target instanceof Element)) return null
  return {
    tag: target.tagName.toLowerCase(),
    action: closestAttributeValue(target, "[data-action]", "data-action"),
    component: closestAttributeValue(target, "[data-component]", "data-component"),
    titlebarNoDrag: target.closest("[data-titlebar-no-drag]") !== null,
    ariaExpanded: target.getAttribute("aria-expanded"),
    ariaLabel: target.getAttribute("aria-label"),
  }
}

export function describeBenchToggleEvent(event: DiagnosticEventLike): DomEventDiagnostic {
  return {
    type: event.type,
    button: typeof event.button === "number" ? event.button : null,
    buttons: typeof event.buttons === "number" ? event.buttons : null,
    clientX: typeof event.clientX === "number" ? event.clientX : null,
    clientY: typeof event.clientY === "number" ? event.clientY : null,
    defaultPrevented: event.defaultPrevented,
    eventPhase: event.eventPhase,
    target: elementInfo(event.target),
    currentTarget: elementInfo(event.currentTarget),
  }
}

export function isBenchToggleEventTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[data-action="titlebar-toggle-right-sidebar"]') !== null
  )
}

export function logBenchToggleStep(
  event: string,
  details: Record<string, unknown> | (() => Record<string, unknown>) = {},
): void {
  if (typeof details === "function" && !isDiagnosticLogEnabled(BENCH_TOGGLE_DIAGNOSTIC_CHANNEL)) {
    return
  }
  diagnosticLog({
    channel: BENCH_TOGGLE_DIAGNOSTIC_CHANNEL,
    event,
    details: typeof details === "function" ? details() : details,
  })
}

export function logBenchToggleDomEvent(event: string, source: DiagnosticEventLike): void {
  logBenchToggleStep(event, () => describeBenchToggleEvent(source))
}
