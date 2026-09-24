import { createChoiceDialogStore } from "@/state/choice-dialog-store"

export type ExternalFileOpenChoice = "open" | "always" | "copy-path" | "show-folder" | "cancel"

type ExternalFileOpenRequest =
  | { kind: "open"; path: string }
  | { kind: "missing"; path: string; outsideNotebook: boolean; canShowFolder: boolean }

export const useExternalFileOpenDialogStore = createChoiceDialogStore<
  ExternalFileOpenRequest,
  ExternalFileOpenChoice
>("cancel")
