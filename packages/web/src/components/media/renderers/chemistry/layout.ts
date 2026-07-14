import type { ChemistryFormat } from "./formats"

const COMPACT_CHEMISTRY_DIAGRAM_VIEWPORT_CLASS = "h-64"
const STANDARD_CHEMISTRY_DIAGRAM_VIEWPORT_CLASS = "h-96"

export function chemistryDiagramViewportClass(format: ChemistryFormat): string {
  switch (format) {
    case "smiles":
    case "cxsmiles":
      return COMPACT_CHEMISTRY_DIAGRAM_VIEWPORT_CLASS
    case "reaction-smiles":
    case "ket":
    case "chemfig":
      return STANDARD_CHEMISTRY_DIAGRAM_VIEWPORT_CLASS
  }
}
