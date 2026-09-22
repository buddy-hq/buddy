import { createChoiceDialogStore } from "@/state/choice-dialog-store"

export type ExternalFileOpenApprovalChoice = "open" | "always" | "cancel"

export const useExternalFileOpenDialogStore = createChoiceDialogStore<
  { path: string },
  ExternalFileOpenApprovalChoice
>("cancel")
