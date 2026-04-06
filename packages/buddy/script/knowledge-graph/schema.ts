import z from "zod"

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

const JsonRecordSchema = z.record(z.string(), z.unknown())

const KnowledgeGraphNodeSchema = z
  .object({
    type: z.literal("node"),
    identifier: z.string().min(1),
    labels: z.array(z.string().min(1)).min(1),
    properties: JsonRecordSchema,
  })
  .strict()

const KnowledgeGraphRelationshipSchema = z
  .object({
    type: z.literal("relationship"),
    identifier: z.string().min(1),
    label: z.string().min(1),
    properties: JsonRecordSchema,
    source_identifier: z.string().min(1),
    source_labels: z.array(z.string().min(1)).min(1),
    target_identifier: z.string().min(1),
    target_labels: z.array(z.string().min(1)).min(1),
  })
  .strict()

type KnowledgeGraphNode = z.infer<typeof KnowledgeGraphNodeSchema>
type KnowledgeGraphRelationship = z.infer<typeof KnowledgeGraphRelationshipSchema>

function sortedKeys(value: Record<string, unknown>) {
  return Object.keys(value).toSorted((left, right) => left.localeCompare(right))
}

function keysMatchExact(actual: string[], expected: readonly string[]) {
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  )
}

export function validateKnowledgeGraphNodeSchema(value: unknown): KnowledgeGraphNode {
  const parsed = KnowledgeGraphNodeSchema.parse(value)
  const actualKeys = sortedKeys(parsed)
  if (!keysMatchExact(actualKeys, CORE_NODE_KEYS)) {
    throw new Error(
      `Knowledge Graph node core schema changed. Expected keys ${CORE_NODE_KEYS.join(", ")}, received ${actualKeys.join(", ")}.`,
    )
  }

  return parsed
}

export function validateKnowledgeGraphRelationshipSchema(
  value: unknown,
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
