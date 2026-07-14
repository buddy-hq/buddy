import type { ChemistryFormat } from "@/components/media/renderers/chemistry/formats"

export type KetcherChemistryFormat = Exclude<ChemistryFormat, "chemfig">

export function isKetcherChemistryFormat(
  format: ChemistryFormat,
): format is KetcherChemistryFormat {
  return format !== "chemfig"
}
