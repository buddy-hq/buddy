import { useEffect, useRef, useState } from "react"
import { ChemfigRenderRequestError } from "./chemfig-adapter"
import type { ChemistryFormat } from "./formats"
import { readCachedChemistrySvg, renderChemistrySvg, type ChemistryRenderResult } from "./render"

export type ChemistryRenderState =
  | {
      status: "loading"
    }
  | {
      status: "ready"
      value: ChemistryRenderResult
    }
  | {
      status: "error"
      message: string
      code?: string
    }

type ChemistryRenderSnapshot = {
  source: string
  format: ChemistryFormat
  directory: string | undefined
  enabled: boolean
  state: ChemistryRenderState
}

const CHEMISTRY_LOADING_STATE: ChemistryRenderState = { status: "loading" }

function snapshotMatches(
  snapshot: ChemistryRenderSnapshot,
  input: {
    source: string
    format: ChemistryFormat
    directory?: string
    enabled: boolean
  },
): boolean {
  return (
    snapshot.source === input.source &&
    snapshot.format === input.format &&
    snapshot.directory === input.directory &&
    snapshot.enabled === input.enabled
  )
}

function renderErrorState(error: unknown): ChemistryRenderState {
  if (error instanceof ChemfigRenderRequestError) {
    return { status: "error", message: error.message, code: error.code }
  }
  const code =
    error !== null && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : undefined
  if (error instanceof Error && error.message.trim()) {
    return {
      status: "error",
      message: error.message.trim(),
      ...(code ? { code } : {}),
    }
  }
  if (typeof error === "string" && error.trim()) {
    return { status: "error", message: error.trim() }
  }
  return { status: "error", message: "Unable to render this chemistry source." }
}

export function useChemistryRender(input: {
  source: string
  format: ChemistryFormat
  directory?: string
  enabled?: boolean
}): ChemistryRenderState {
  const { directory, format, source } = input
  const enabled = input.enabled ?? true
  const requestTokenRef = useRef(0)
  const [snapshot, setSnapshot] = useState<ChemistryRenderSnapshot>(() => ({
    source,
    format,
    directory,
    enabled,
    state:
      (enabled
        ? (() => {
            const cached = readCachedChemistrySvg({ source, format })
            return cached ? { status: "ready" as const, value: cached } : undefined
          })()
        : undefined) ?? CHEMISTRY_LOADING_STATE,
  }))

  useEffect(() => {
    const requestToken = requestTokenRef.current + 1
    requestTokenRef.current = requestToken
    if (!enabled) {
      setSnapshot({
        source,
        format,
        directory,
        enabled,
        state: CHEMISTRY_LOADING_STATE,
      })
      return
    }

    const cached = readCachedChemistrySvg({ source, format })
    if (cached) {
      setSnapshot({
        source,
        format,
        directory,
        enabled,
        state: { status: "ready", value: cached },
      })
      return
    }

    setSnapshot({
      source,
      format,
      directory,
      enabled,
      state: CHEMISTRY_LOADING_STATE,
    })
    const abortController = new AbortController()
    void renderChemistrySvg({ source, format, directory, signal: abortController.signal }).then(
      (value) => {
        if (requestTokenRef.current === requestToken) {
          setSnapshot({
            source,
            format,
            directory,
            enabled,
            state: { status: "ready", value },
          })
        }
      },
      (error: unknown) => {
        if (requestTokenRef.current === requestToken) {
          setSnapshot({
            source,
            format,
            directory,
            enabled,
            state: renderErrorState(error),
          })
        }
      },
    )

    return () => {
      abortController.abort()
      if (requestTokenRef.current === requestToken) {
        requestTokenRef.current += 1
      }
    }
  }, [directory, enabled, format, source])

  return snapshotMatches(snapshot, { source, format, directory, enabled })
    ? snapshot.state
    : CHEMISTRY_LOADING_STATE
}
