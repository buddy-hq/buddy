import type { ReactNode } from "react"

export type OnboardingAuthChoice = "chatgpt_plus" | "free_models"

export type OnboardingPhase = "splash" | "auth" | "folder"

export type OnboardingShellProps = {
  title: ReactNode
  description: ReactNode
  eyebrow?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}
