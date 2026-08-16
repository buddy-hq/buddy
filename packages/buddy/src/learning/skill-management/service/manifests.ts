import fsp from "node:fs/promises"
import path from "node:path"
import { parse } from "yaml"
import z from "zod"
import type { BuddySkillPresentation } from "../../runtime/define-buddy-skill"
import { parseTErrorMessage } from "../../shared/parse-values"

const BUDDY_SKILL_MANIFEST_RELATIVE_PATH = path.join("agents", "buddy.yaml")
const DISPLAY_NAME_MIN_LENGTH = 1
const DISPLAY_NAME_MAX_LENGTH = 64
const SHORT_DESCRIPTION_MIN_LENGTH = 25
const SHORT_DESCRIPTION_MAX_LENGTH = 64
const ICON_MAX_LENGTH = 512

const buddySkillManifestSchema = z.strictObject({
  interface: z.strictObject({
    display_name: z.string().trim().min(DISPLAY_NAME_MIN_LENGTH).max(DISPLAY_NAME_MAX_LENGTH),
    short_description: z
      .string()
      .trim()
      .min(SHORT_DESCRIPTION_MIN_LENGTH)
      .max(SHORT_DESCRIPTION_MAX_LENGTH),
    icon: z.string().trim().min(1).max(ICON_MAX_LENGTH).optional(),
  }),
})

type BuddySkillManifest = z.infer<typeof buddySkillManifestSchema>

type ResolvedSkillPresentation = {
  displayName: string
  shortDescription: string
  icon?: string
}

function renderBuddySkillManifest(presentation: BuddySkillPresentation): string {
  return [
    "interface:",
    `  display_name: ${JSON.stringify(presentation.displayName)}`,
    `  short_description: ${JSON.stringify(presentation.shortDescription)}`,
    ...(presentation.icon ? [`  icon: ${JSON.stringify(presentation.icon)}`] : []),
    "",
  ].join("\n")
}

const warnedManifestPaths = new Set<string>()

function warnInvalidManifestOnce(manifestPath: string, reason: string): void {
  if (warnedManifestPaths.has(manifestPath)) {
    return
  }
  warnedManifestPaths.add(manifestPath)
  console.warn(`Ignoring bundled skill manifest ${manifestPath}: ${reason}`)
}

async function loadBuddySkillManifest(
  skillDirectory: string,
): Promise<BuddySkillManifest | undefined> {
  const manifestPath = path.join(skillDirectory, BUDDY_SKILL_MANIFEST_RELATIVE_PATH)
  const source = await fsp.readFile(manifestPath, "utf8").catch((error) => {
    const reason = parseTErrorMessage(error) || "failed to read manifest"
    warnInvalidManifestOnce(manifestPath, reason)
    return undefined
  })
  if (source === undefined) {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = parse(source)
  } catch (error) {
    const reason = parseTErrorMessage(error) || "invalid YAML"
    warnInvalidManifestOnce(manifestPath, reason)
    return undefined
  }

  const result = buddySkillManifestSchema.safeParse(parsed)
  if (!result.success) {
    warnInvalidManifestOnce(manifestPath, z.prettifyError(result.error))
    return undefined
  }

  return result.data
}

function resolveSkillPresentation(input: {
  name: string
  description: string
  manifest: BuddySkillManifest | undefined
}): ResolvedSkillPresentation {
  return Object.assign(
    {
      displayName: input.manifest?.interface.display_name ?? input.name,
      shortDescription: input.manifest?.interface.short_description ?? input.description,
    },
    input.manifest?.interface.icon ? { icon: input.manifest.interface.icon } : undefined,
  )
}

export {
  BUDDY_SKILL_MANIFEST_RELATIVE_PATH,
  buddySkillManifestSchema,
  loadBuddySkillManifest,
  renderBuddySkillManifest,
  resolveSkillPresentation,
}

export type { BuddySkillManifest, ResolvedSkillPresentation }
