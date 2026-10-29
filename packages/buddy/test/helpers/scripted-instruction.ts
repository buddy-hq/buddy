import z from "zod"

export const instruction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reply"), text: z.string() }),
  z.object({ kind: z.literal("command"), text: z.string() }),
  z.object({ kind: z.literal("pause"), key: z.string(), text: z.string() }),
  z.object({ kind: z.literal("hold"), key: z.string(), text: z.string() }),
  z.object({ kind: z.literal("stream"), key: z.string(), text: z.string() }),
  z.object({ kind: z.literal("read"), path: z.string() }),
  z.object({ kind: z.literal("question") }),
  z.object({
    kind: z.literal("tool"),
    name: z.string(),
    arguments: z.record(z.string(), z.json()),
  }),
  z.object({ kind: z.literal("catalog"), access: z.enum(["allowed", "denied"]) }),
  z.object({
    kind: z.literal("delegate"),
    role: z.string(),
    prompt: z.string(),
    background: z.boolean().optional(),
  }),
])
export type Instruction = z.infer<typeof instruction>

export function scenario(input: Instruction): string {
  return `BEGIN_CONFORMANCE\n${JSON.stringify(input)}\nEND_CONFORMANCE`
}

export function decodeInstruction(text: string): Instruction | undefined {
  const encoded = /BEGIN_CONFORMANCE\s*(.+)\s*END_CONFORMANCE/su.exec(text)?.[1]
  const parsed = encoded ? instruction.safeParse(JSON.parse(encoded)) : undefined
  return parsed?.success ? parsed.data : undefined
}
