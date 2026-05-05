export function sanitizeMermaidSvg(svg: string): string {
  const trimmed = svg.trim()
  if (typeof window === "undefined") {
    return trimmed
  }

  const document = new DOMParser().parseFromString(trimmed, "image/svg+xml")
  const root = document.documentElement
  if (!(root instanceof SVGSVGElement)) {
    return trimmed
  }

  for (const element of Array.from(
    root.querySelectorAll("script, iframe, object, embed, link, meta"),
  )) {
    element.remove()
  }

  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim()
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name)
        continue
      }
      if (
        ["href", "xlink:href"].includes(name) &&
        /^(?:javascript:|data:text\/html)/iu.test(value)
      ) {
        element.removeAttribute(attribute.name)
      }
    }
  }

  return root.outerHTML.trim()
}
