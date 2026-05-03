function normalizeMermaidSource(source: string): string {
  const withoutBom = source.replaceAll("\uFEFF", "")
  const normalizedNewlines = withoutBom.replace(/\r\n?/gu, "\n")
  const normalizedTabs = normalizedNewlines.replace(/\t/gu, "  ")

  return normalizedTabs
    .split("\n")
    .map((line) => line.replace(/[ \f\v]+$/gu, ""))
    .join("\n")
}

export { normalizeMermaidSource }
