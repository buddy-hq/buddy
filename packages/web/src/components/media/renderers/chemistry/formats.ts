export const CHEMISTRY_FORMATS = [
  "smiles",
  "cxsmiles",
  "reaction-smiles",
  "ket",
  "chemfig",
] as const

export type ChemistryFormat = (typeof CHEMISTRY_FORMATS)[number]
export type ChemistryRenderOwner = "browser" | "backend"

const chemistryFormatSet: ReadonlySet<string> = new Set(CHEMISTRY_FORMATS)

export function isChemistryFormat(value: string): value is ChemistryFormat {
  return chemistryFormatSet.has(value)
}

export function chemistryRenderOwner(format: ChemistryFormat): ChemistryRenderOwner {
  return format === "chemfig" ? "backend" : "browser"
}

export function isBackendChemistryFormat(
  format: ChemistryFormat,
): format is Extract<ChemistryFormat, "chemfig"> {
  return chemistryRenderOwner(format) === "backend"
}

export function chemistryFormatLabel(format: ChemistryFormat): string {
  switch (format) {
    case "smiles":
      return "SMILES"
    case "cxsmiles":
      return "CXSMILES"
    case "reaction-smiles":
      return "Reaction SMILES"
    case "ket":
      return "KET"
    case "chemfig":
      return "chemfig"
  }
}
