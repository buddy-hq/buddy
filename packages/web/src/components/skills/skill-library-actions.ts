import type { SkillLibraryEntry } from "@/state/skills-actions"

export type SkillLibraryAction = "install" | "installed" | "remove" | "update"
export type SkillLibraryButtonVariant = "default" | "destructive" | "outline" | "secondary"

export function skillLibraryAction(
  state: SkillLibraryEntry["state"],
): SkillLibraryAction {
  if (state === "available") return "install"
  if (state === "update_available") return "update"
  if (state === "withdrawn_installed") return "remove"
  return "installed"
}

export function isInstalledLibrarySkill(state: SkillLibraryEntry["state"]): boolean {
  return state === "installed" || state === "update_available"
}

export function skillLibraryButtonVariant(
  action: SkillLibraryAction,
): SkillLibraryButtonVariant {
  if (action === "install") return "default"
  if (action === "update") return "secondary"
  if (action === "remove") return "destructive"
  return "outline"
}
