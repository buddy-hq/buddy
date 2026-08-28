export type ReleaseGateCommand = {
  readonly command: string
  readonly args: readonly string[]
}

export const RELEASE_GATE_COMMAND_PLAN: readonly ReleaseGateCommand[] = [
  { command: "bun", args: ["run", "sdk:generate"] },
  { command: "bun", args: ["fmt"] },
  { command: "bun", args: ["lint"] },
  { command: "bun", args: ["typecheck"] },
  {
    command: "bun",
    args: ["run", "--cwd", "packages/buddy", "test:release-skill-artifacts"],
  },
  {
    command: "bun",
    args: ["run", "--cwd", "packages/buddy", "skill:artifacts:build"],
  },
]
