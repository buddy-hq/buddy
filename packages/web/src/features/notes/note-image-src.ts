import { resolveAssetUrl } from "@/lib/resource-url"

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z0-9+.-]*:/iu

export function resolveNoteImageSrc(input: { notePath: string; src: string }): string {
  if (!input.src) return input.src
  if (ABSOLUTE_URL_PATTERN.test(input.src)) return resolveAssetUrl(input.src)
  const query = new URLSearchParams({ note: input.notePath, src: input.src })
  return resolveAssetUrl(`/api/notes/image?${query.toString()}`)
}
