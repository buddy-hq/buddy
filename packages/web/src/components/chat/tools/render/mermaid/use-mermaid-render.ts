import { useEffect, useState } from "react"
import { language } from "@/context/language"
import { renderMermaidSvg, type MermaidRenderResult } from "../../../../../lib/mermaid/render"

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
    }

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim()
  }
  return language.t("chatTools.mermaidDiagram.renderErrorDefault")
}

interface UseMermaidRenderOptions {
  source: string
  artifactID?: string
}

interface UseMermaidRenderResult {
  state: MermaidRenderState
}

export function useMermaidRender({
  source,
  artifactID,
}: UseMermaidRenderOptions): UseMermaidRenderResult {
  const [state, setState] = useState<MermaidRenderState>({ status: "loading" })

  useEffect(() => {
    let cancelled = false
    setState({ status: "loading" })

    void renderMermaidSvg({
      source,
      artifactID,
    })
      .then((value) => {
        if (cancelled) return
        setState({
          status: "ready",
          value,
        })
      })
      .catch((error) => {
        if (cancelled) return
        setState({
          status: "error",
          message: errorMessage(error),
        })
      })

    return () => {
      cancelled = true
    }
  }, [artifactID, source])

  return { state }
}
