import { useEffect, useRef, useState } from "react"
import { language } from "@/context/language"
import { useTheme } from "@/theme"
import {
  MermaidRenderFailureError,
  readCachedMermaidSvg,
  renderMermaidSvg,
  type MermaidRenderResult,
} from "./lib/render"
import type { MermaidThemeConfig } from "./lib/theme"

export type MermaidRenderState =
  | {
      status: "loading"
    }
  | {
      status: "ready"
      value: MermaidRenderResult
    }
  | {
      status: "error"
      message: string
      renderKey?: string
      persisted: boolean
    }

type UseMermaidRenderOptions = {
  source: string
  directory?: string
  enabled?: boolean
  objectID?: string
  priority?: number
  revisionID?: string | null
  themeConfig?: MermaidThemeConfig
}

type UseMermaidRenderResult = {
  state: MermaidRenderState
}

function errorMessage(error: Error): MermaidRenderState {
  if (error instanceof MermaidRenderFailureError) {
    return {
      status: "error",
      message: error.message,
      renderKey: error.renderKey,
      persisted: error.persisted,
    }
  }
  if (error.message.trim()) {
    return {
      status: "error",
      message: error.message.trim(),
      persisted: false,
    }
  }
  return {
    status: "error",
    message: language.t("chatTools.mermaidDiagram.renderErrorDefault"),
    persisted: false,
  }
}

function getCachedState(input: {
  objectID?: string
  revisionID?: string | null
  source: string
  themeConfig?: MermaidThemeConfig
}): MermaidRenderState | undefined {
  const cached = readCachedMermaidSvg(input)
  if (!cached) {
    return undefined
  }
  return {
    status: "ready",
    value: cached,
  }
}

export function useMermaidRender({
  source,
  directory,
  enabled = true,
  objectID,
  priority,
  revisionID,
  themeConfig,
}: UseMermaidRenderOptions): UseMermaidRenderResult {
  const { mode, themeId } = useTheme()
  const themeDependencyKey = themeConfig?.themeSignature ?? `${themeId}:${mode}`
  const requestTokenRef = useRef(0)
  const [state, setState] = useState<MermaidRenderState>(
    () =>
      (enabled ? getCachedState({ source, objectID, revisionID, themeConfig }) : undefined) ?? {
        status: "loading",
      },
  )

  useEffect(() => {
    if (!enabled) {
      setState({ status: "loading" })
      return
    }

    const cachedState = getCachedState({ source, objectID, revisionID, themeConfig })
    if (cachedState) {
      setState(cachedState)
      return
    }

    const requestToken = requestTokenRef.current + 1
    requestTokenRef.current = requestToken
    setState({ status: "loading" })

    void renderMermaidSvg({
      source,
      directory,
      objectID,
      priority,
      revisionID,
      themeConfig,
    })
      .then((value) => {
        if (requestTokenRef.current !== requestToken) {
          return
        }
        setState({
          status: "ready",
          value,
        })
      })
      .catch((error) => {
        if (requestTokenRef.current !== requestToken) {
          return
        }
        setState(
          errorMessage(
            error instanceof Error
              ? error
              : new Error(language.t("chatTools.mermaidDiagram.renderErrorDefault")),
          ),
        )
      })
  }, [directory, enabled, objectID, priority, revisionID, source, themeConfig, themeDependencyKey])

  return { state }
}
