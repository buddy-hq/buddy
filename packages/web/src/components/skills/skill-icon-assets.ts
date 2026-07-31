import { resolveAssetUrl } from "@/lib/resource-url"

const SKILL_ICON_MODULES = import.meta.glob<string>("../../../../../assets/skills/bundled/*.webp", {
  eager: true,
  import: "default",
  query: "?url",
})

const SKILL_ICON_FILENAME_PREFIX = "buddy-skill-"
const SKILL_ICON_FILENAME_SUFFIX = ".webp"

const PACKAGED_SKILL_ICON_URL_BY_NAME: ReadonlyMap<string, string> = new Map(
  Object.entries(SKILL_ICON_MODULES).flatMap(([path, url]) => {
    const filename = path.split("/").at(-1)
    if (
      !filename?.startsWith(SKILL_ICON_FILENAME_PREFIX) ||
      !filename.endsWith(SKILL_ICON_FILENAME_SUFFIX)
    ) {
      return []
    }
    return [[filename, url] as const]
  }),
)

const SUPPORTED_REMOTE_ICON_PROTOCOLS = new Set(["http:", "https:"])

export function resolveSkillIconURL(reference: string | undefined): string | undefined {
  if (!reference) return undefined
  const packagedURL = PACKAGED_SKILL_ICON_URL_BY_NAME.get(reference)
  if (packagedURL) return packagedURL
  if (reference.startsWith("/api/skills/library/")) return resolveAssetUrl(reference)

  try {
    const url = new URL(reference)
    return SUPPORTED_REMOTE_ICON_PROTOCOLS.has(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}
