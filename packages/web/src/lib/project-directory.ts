export function canonicalProjectDirectory(input: string | undefined): string | undefined {
  if (input === undefined) return undefined
  const normalized = input.trim().replace(/\/+$/, "")
  if (!normalized || normalized === "/") return undefined
  return normalized
}
