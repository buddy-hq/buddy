type CloseBenchWorkspaceInput = {
  closeWorkspace: () => void
  waitForWorkspaceCollapse: () => Promise<void>
  navigateToChat: () => Promise<void>
}

export const BENCH_RIGHT_WORKSPACE_PANEL_COMPONENT = "bench-right-workspace-panel"

const FLEX_GROW_TRANSITION_PROPERTY = "flex-grow"
const WORKSPACE_COLLAPSE_TRANSITION_DURATION_MS = 200
const WORKSPACE_COLLAPSE_TRANSITION_BUFFER_MS = 50
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

export function waitForBenchRightWorkspaceCollapse(): Promise<void> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return Promise.resolve()
  }
  if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
    return Promise.resolve()
  }

  const panel = document.querySelector<HTMLElement>(
    `[data-component="${BENCH_RIGHT_WORKSPACE_PANEL_COMPONENT}"]`,
  )
  if (!panel || panel.getBoundingClientRect().width === 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(fallbackTimer)
      panel.removeEventListener("transitionend", onTransitionEnd)
      panel.removeEventListener("transitioncancel", onTransitionEnd)
      resolve()
    }
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== panel || event.propertyName !== FLEX_GROW_TRANSITION_PROPERTY) return
      finish()
    }
    const fallbackTimer = window.setTimeout(
      finish,
      WORKSPACE_COLLAPSE_TRANSITION_DURATION_MS + WORKSPACE_COLLAPSE_TRANSITION_BUFFER_MS,
    )

    panel.addEventListener("transitionend", onTransitionEnd)
    panel.addEventListener("transitioncancel", onTransitionEnd)
  })
}

export async function closeBenchWorkspace(input: CloseBenchWorkspaceInput): Promise<void> {
  input.closeWorkspace()
  await input.waitForWorkspaceCollapse()
  await input.navigateToChat()
}
