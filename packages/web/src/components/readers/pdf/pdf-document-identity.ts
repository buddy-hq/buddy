export function pdfDocumentFingerprint(
  fingerprints: readonly (string | null)[],
): string | undefined {
  const values = fingerprints.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  )
  if (values.length === 0) return undefined
  return values.join(":")
}
