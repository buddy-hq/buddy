import type { RuntimePromptSection } from "./types.js"

export function createPromptSection(
  kind: RuntimePromptSection["kind"],
  label: string,
  text: string,
): RuntimePromptSection {
  return { kind, label, text }
}

export function hasText(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function titleCaseFromKebab(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}
