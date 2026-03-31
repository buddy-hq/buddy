import { useEffect } from "react"
import type { MermaidRenderResult } from "../../../../../lib/mermaid/render"

type MermaidInlineViewProps = {
  value: MermaidRenderResult
  ariaLabel: string
  svgRef: React.RefObject<HTMLDivElement>
}

function mountSvg(host: HTMLDivElement | null, result: MermaidRenderResult) {
  if (!host) return

  host.innerHTML = result.svg
  result.bindFunctions?.(host)
}

export function MermaidInlineView({ value, ariaLabel, svgRef }: MermaidInlineViewProps) {
  useEffect(() => {
    mountSvg(svgRef.current, value)
  }, [value, svgRef])

  return (
    <div
      ref={svgRef}
      data-component="mermaid-diagram"
      role="img"
      aria-label={ariaLabel}
      className="max-h-[48vh] overflow-auto pr-2"
    />
  )
}
