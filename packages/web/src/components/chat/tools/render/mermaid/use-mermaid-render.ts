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
  artifactID?: string
  directory?: string
  enabled?: boolean
  priority?: number
  themeConfig?: MermaidThemeConfig
}

type UseMermaidRenderResult = {
  state: MermaidRenderState
}

function errorMessage(error: unknown): MermaidRenderState {
  if (error instanceof MermaidRenderFailureError) {
    return {
      status: "error",
      message: error.message,
      renderKey: error.renderKey,
      persisted: error.persisted,
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return {
      status: "error",
      message: error.message.trim(),
      persisted: false,
    }
  }
  if (typeof error === "string" && error.trim()) {
    return {
      status: "error",
      message: error.trim(),
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
  artifactID?: string
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
  artifactID,
  directory,
  enabled = true,
  priority,
  themeConfig,
}: UseMermaidRenderOptions): UseMermaidRenderResult {
  const { mode, themeId } = useTheme()
  const themeDependencyKey = themeConfig?.themeSignature ?? `${themeId}:${mode}`
  const requestTokenRef = useRef(0)
  const [state, setState] = useState<MermaidRenderState>(
    () =>
      (enabled ? getCachedState({ source, artifactID, themeConfig }) : undefined) ?? {
        status: "loading",
      },
  )

  useEffect(() => {
    if (!enabled) {
      setState({ status: "loading" })
      return
    }

    const cachedState = getCachedState({ source, artifactID, themeConfig })
    if (cachedState) {
      setState(cachedState)
      return
    }

    const requestToken = requestTokenRef.current + 1
    requestTokenRef.current = requestToken
    setState({ status: "loading" })

    void renderMermaidSvg({
      source,
      artifactID,
      directory,
      priority,
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
        setState(errorMessage(error))
      })
  }, [artifactID, directory, enabled, priority, source, themeConfig, themeDependencyKey])

  return { state }
}
