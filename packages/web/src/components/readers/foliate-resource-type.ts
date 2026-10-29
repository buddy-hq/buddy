const INERT_RESOURCE_TYPES = new Set([
  "text/css", "text/vtt",
  "image/png", "image/apng", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/avif",
  "image/bmp", "image/x-ms-bmp", "image/x-icon", "image/vnd.microsoft.icon", "image/jxl",
  "application/vnd.ms-opentype",
  "audio/mpeg", "audio/mp4", "audio/ogg", "audio/webm", "audio/aac", "audio/flac",
  "audio/wav", "audio/x-wav", "audio/wave", "audio/opus", "audio/3gpp", "audio/3gpp2",
  "video/mp4", "video/mpeg", "video/ogg", "video/webm", "video/quicktime", "video/3gpp", "video/3gpp2",
])
const FONT_TYPE = /^(?:font\/|application\/(?:x-)?font-)[\w.+-]+$/u
const DOCUMENT_TYPES = new Set([
  "application/xml", "text/xml", "text/xsl", "application/xslt", "application/xsl",
  "text/xsl-fo", "application/html", "text/xhtml", "text/x-html", "application/xhtml",
])

type FoliateResourceCategory = "html" | "xhtml" | "svg" | "document" | "inert" | "unknown"

export type FoliateResourceType = {
  category: FoliateResourceCategory
  type: string
}

function resourceCategory(type: string): FoliateResourceCategory {
  if (type === "text/html") return "html"
  if (type === "application/xhtml+xml") return "xhtml"
  if (type === "image/svg+xml") return "svg"
  if (DOCUMENT_TYPES.has(type) || type.endsWith("+xml")) return "document"
  if (INERT_RESOURCE_TYPES.has(type) || FONT_TYPE.test(type)) return "inert"
  return "unknown"
}

export function foliateResourceType(declaredType: string): FoliateResourceType {
  const type = declaredType.split(";", 1)[0]?.trim().toLowerCase() ?? ""
  return { category: resourceCategory(type), type }
}
