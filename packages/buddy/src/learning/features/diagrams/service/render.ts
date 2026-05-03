import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import { MermaidArtifactPath } from "./path"
import { type MermaidArtifactManifest } from "./types"
import { normalizeMermaidSource } from "./normalize"
import { MAX_REPAIR_PASSES, runMermaidRepairPass } from "./repair"
import { validateMermaidSource } from "./validate"
import { MermaidRenderError } from "../errors"

type MermaidArtifactIdentityInput = Omit<MermaidArtifactManifest, "artifactID" | "version">

function hashMermaidSource(source: string): string {
  return createHash("sha256").update(source).digest("hex")
}

function hashMermaidArtifact(input: MermaidArtifactIdentityInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

function buildMermaidArtifactUrl(directory: string, artifactID: string): string {
  return `/api/mermaid-artifacts/${artifactID}?directory=${encodeURIComponent(directory)}`
}

function buildMermaidMarkdown(source: string): string {
  return ["```mermaid", source, "```"].join("\n")
}

function inferMermaidDiagramType(source: string): string {
  const lines = source.split("\n")

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("%%")) {
      continue
    }

    const [token] = trimmed.split(/\s+/u)
    if (!token) {
      continue
    }

    if (token.toLowerCase() === "graph") {
      return "flowchart"
    }

    return token
  }

  return "unknown"
}

async function writeMermaidArtifact(input: {
  directory: string
  manifest: MermaidArtifactManifest
  source: string
}): Promise<void> {
  const targetDirectory = MermaidArtifactPath.artifactDirectory(
    input.directory,
    input.manifest.artifactID,
  )
  await fs.mkdir(targetDirectory, { recursive: true })
  await Promise.all([
    fs.writeFile(
      MermaidArtifactPath.manifestFile(input.directory, input.manifest.artifactID),
      `${JSON.stringify(input.manifest, null, 2)}\n`,
      "utf8",
    ),
    fs.writeFile(
      MermaidArtifactPath.diagramFile(input.directory, input.manifest.artifactID),
      input.source,
      "utf8",
    ),
  ])
}

async function repairAndValidateMermaid(input: { source: string }): Promise<{
  source: string
  repairAttempts: number
  repairLog: string[]
}> {
  let currentSource = normalizeMermaidSource(input.source)
  let repairAttempts = 0
  const repairLog: string[] = []

  let validation = await validateMermaidSource(currentSource)
  if (validation.ok) {
    return {
      source: currentSource,
      repairAttempts,
      repairLog,
    }
  }

  repairLog.push(`initial validation failed: ${validation.diagnostics.join(" | ")}`)

  for (let pass = 1; pass <= MAX_REPAIR_PASSES; pass += 1) {
    const repaired = runMermaidRepairPass(currentSource)
    if (repaired.source === currentSource) {
      repairLog.push(`pass ${pass}: no additional deterministic repairs were applicable`)
      break
    }

    currentSource = repaired.source
    repairAttempts += 1
    if (repaired.repairLog.length > 0) {
      repairLog.push(...repaired.repairLog.map((entry) => `pass ${pass}: ${entry}`))
    }

    validation = await validateMermaidSource(currentSource)
    if (validation.ok) {
      return {
        source: currentSource,
        repairAttempts,
        repairLog,
      }
    }

    repairLog.push(`pass ${pass}: validation failed: ${validation.diagnostics.join(" | ")}`)
  }

  throw new MermaidRenderError({
    diagnostics: validation.diagnostics,
    repairAttempts,
    repairLog,
  })
}

export {
  hashMermaidSource,
  hashMermaidArtifact,
  buildMermaidArtifactUrl,
  buildMermaidMarkdown,
  inferMermaidDiagramType,
  writeMermaidArtifact,
  repairAndValidateMermaid,
}
