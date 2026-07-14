import { sanitizeGeneratedSvg } from "@/components/media/renderers/generated-svg-sanitize"

export function sanitizeMermaidSvg(svg: string): string {
  return sanitizeGeneratedSvg(svg)
}
