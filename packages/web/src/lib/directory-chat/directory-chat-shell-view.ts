export const DIRECTORY_CHAT_SHELL_VIEW = {
  WORKSPACE: "workspace",
  LIBRARY: "library",
  SKILLS: "skills",
} as const

export type DirectoryChatShellView =
  (typeof DIRECTORY_CHAT_SHELL_VIEW)[keyof typeof DIRECTORY_CHAT_SHELL_VIEW]
