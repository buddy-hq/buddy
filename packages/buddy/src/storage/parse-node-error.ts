import z from "zod"

const nodeErrorCodeSchema = z.object({
  code: z.string().optional(),
})

export function parseNodeErrorCode<TValue>(value: TValue): string | undefined {
  const parsed = nodeErrorCodeSchema.safeParse(value)
  return parsed.success ? parsed.data.code : undefined
}

export function nodeErrorHasCode<TValue>(value: TValue, code: string): boolean {
  return parseNodeErrorCode(value) === code
}
