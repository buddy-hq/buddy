export function hasText(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0
}
