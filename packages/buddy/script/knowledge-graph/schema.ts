import z from "zod"
import type { TJsonObject, TJsonValue } from "../parse-values"

const CORE_NODE_KEYS = ["identifier", "labels", "properties", "type"] as const
const CORE_RELATIONSHIP_KEYS = [
  "identifier",
  "label",
  "properties",
  "source_identifier",
  "source_labels",
  "target_identifier",
  "target_labels",
  "type",
] as const

const jsonValueSchema: z.ZodType<TJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
)
const jsonObjectSchema: z.ZodType<TJsonObject> = z.record(z.string(), jsonValueSchema)

const KnowledgeGraphNodeSchema = z
  .object({
    type: z.literal("node"),
    identifier: z.string().min(1),
    labels: z.array(z.string().min(1)).min(1),
    properties: jsonObjectSchema,
  })
  .strict()

const KnowledgeGraphRelationshipSchema = z
  .object({
    type: z.literal("relationship"),
    identifier: z.string().min(1),
    label: z.string().min(1),
    properties: jsonObjectSchema,
    source_identifier: z.string().min(1),
    source_labels: z.array(z.string().min(1)).min(1),
    target_identifier: z.string().min(1),
    target_labels: z.array(z.string().min(1)).min(1),
  })
  .strict()

type KnowledgeGraphNode = z.infer<typeof KnowledgeGraphNodeSchema>
type KnowledgeGraphRelationship = z.infer<typeof KnowledgeGraphRelationshipSchema>

function sortedKeys(value: KnowledgeGraphNode | KnowledgeGraphRelationship) {
  return Object.keys(value).toSorted((left, right) => left.localeCompare(right))
}

function keysMatchExact(actual: string[], expected: readonly string[]) {
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  )
}

export function validateKnowledgeGraphNodeSchema<TValue>(value: TValue): KnowledgeGraphNode {
  const parsed = KnowledgeGraphNodeSchema.parse(value)
  const actualKeys = sortedKeys(parsed)
  if (!keysMatchExact(actualKeys, CORE_NODE_KEYS)) {
    throw new Error(
      `Knowledge Graph node core schema changed. Expected keys ${CORE_NODE_KEYS.join(", ")}, received ${actualKeys.join(", ")}.`,
    )
  }

  return parsed
}

export function validateKnowledgeGraphRelationshipSchema<TValue>(
  value: TValue,
): KnowledgeGraphRelationship {
  const parsed = KnowledgeGraphRelationshipSchema.parse(value)
  const actualKeys = sortedKeys(parsed)
  if (!keysMatchExact(actualKeys, CORE_RELATIONSHIP_KEYS)) {
    throw new Error(
      `Knowledge Graph relationship core schema changed. Expected keys ${CORE_RELATIONSHIP_KEYS.join(", ")}, received ${actualKeys.join(", ")}.`,
    )
  }

  return parsed
}

export type { KnowledgeGraphNode, KnowledgeGraphRelationship }
