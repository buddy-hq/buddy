import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { Global } from "@buddy/opencode-adapter/global"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
import {
  GeneratedImageProvenanceSchema,
  generatedImageSessionDirectory,
  generatedImagesRoot,
  type GeneratedImageProvenance,
} from "./generated-image"

const IMAGEGEN_TOOL_ID = "imagegen" as const

type GeneratedImageAuthorizationContext = {
  messages: readonly MessageV2.WithParts[]
  sessionID: string
}

function isWithinBoundary(boundaryPath: string, targetPath: string): boolean {
  const relativePath = path.relative(boundaryPath, targetPath)
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
}

function matchingGeneratedImageProvenance(
  imagePath: string,
  ctx: GeneratedImageAuthorizationContext,
): GeneratedImageProvenance | undefined {
  const resolvedImagePath = path.resolve(imagePath)

  for (const message of ctx.messages) {
    if (String(message.info.sessionID) !== ctx.sessionID) continue

    for (const part of message.parts) {
      if (
        part.type !== "tool" ||
        part.tool !== IMAGEGEN_TOOL_ID ||
        part.state.status !== "completed" ||
        String(part.sessionID) !== ctx.sessionID ||
        part.messageID !== message.info.id
      ) {
        continue
      }

      const parsed = GeneratedImageProvenanceSchema.safeParse(
        part.state.metadata.generatedImageProvenance,
      )
      if (
        !parsed.success ||
        parsed.data.sessionID !== ctx.sessionID ||
        parsed.data.callID !== part.callID ||
        part.state.metadata.savedPath !== parsed.data.path ||
        path.resolve(parsed.data.path) !== resolvedImagePath
      ) {
        continue
      }
      return parsed.data
    }
  }

  return undefined
}

async function resolveCanonicalManagedSessionRoot(sessionID: string): Promise<
  | {
      canonicalSessionRoot: string
      lexicalSessionRoot: string
    }
  | undefined
> {
  const lexicalDataRoot = path.resolve(Global.Path.data)
  const lexicalGeneratedRoot = path.resolve(generatedImagesRoot())
  const lexicalSessionRoot = path.resolve(generatedImageSessionDirectory(sessionID))
  if (
    !isWithinBoundary(lexicalDataRoot, lexicalGeneratedRoot) ||
    !isWithinBoundary(lexicalGeneratedRoot, lexicalSessionRoot)
  ) {
    return undefined
  }

  const [canonicalDataRoot, canonicalGeneratedRoot, canonicalSessionRoot] = await Promise.all([
    fs.realpath(lexicalDataRoot).catch(() => undefined),
    fs.realpath(lexicalGeneratedRoot).catch(() => undefined),
    fs.realpath(lexicalSessionRoot).catch(() => undefined),
  ])
  if (
    !canonicalDataRoot ||
    !canonicalGeneratedRoot ||
    !canonicalSessionRoot ||
    !isWithinBoundary(canonicalDataRoot, canonicalGeneratedRoot) ||
    !isWithinBoundary(canonicalGeneratedRoot, canonicalSessionRoot)
  ) {
    return undefined
  }

  return { canonicalSessionRoot, lexicalSessionRoot }
}

async function resolveTrustedGeneratedImagePath(
  imagePath: string,
  ctx: GeneratedImageAuthorizationContext,
): Promise<string | undefined> {
  const provenance = matchingGeneratedImageProvenance(imagePath, ctx)
  if (!provenance) return undefined

  const managedRoot = await resolveCanonicalManagedSessionRoot(ctx.sessionID)
  const lexicalImagePath = path.resolve(imagePath)
  if (!managedRoot || !isWithinBoundary(managedRoot.lexicalSessionRoot, lexicalImagePath)) {
    return undefined
  }

  const canonicalImagePath = await fs.realpath(lexicalImagePath).catch(() => undefined)
  if (
    !canonicalImagePath ||
    !isWithinBoundary(managedRoot.canonicalSessionRoot, canonicalImagePath)
  ) {
    return undefined
  }

  const stats = await fs.stat(canonicalImagePath).catch(() => undefined)
  if (!stats?.isFile() || stats.size !== provenance.sizeBytes) {
    return undefined
  }

  const bytes = await fs.readFile(canonicalImagePath).catch(() => undefined)
  if (!bytes || createHash("sha256").update(bytes).digest("hex") !== provenance.sha256) {
    return undefined
  }
  return canonicalImagePath
}

export { resolveTrustedGeneratedImagePath }
export type { GeneratedImageAuthorizationContext }
