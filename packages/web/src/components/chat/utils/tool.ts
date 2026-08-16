export function toToolStatus<TValue>(value: TValue): "pending" | "running" | "completed" | "error" {
  if (value === "running") return "running"
  if (value === "completed") return "completed"
  if (value === "error") return "error"
  return "pending"
}
