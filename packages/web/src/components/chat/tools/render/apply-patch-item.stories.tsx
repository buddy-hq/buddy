import type { Meta, StoryObj } from "@storybook/react-vite"
import { ApplyPatchFileItem } from "./apply-patch-item"

const meta = {
  title: "Web/Tools/ApplyPatch/ApplyPatchFileItem",
  component: ApplyPatchFileItem,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ApplyPatchFileItem>

export default meta
type Story = StoryObj<typeof meta>

export const Update: Story = {
  args: {
    file: {
      relativePath: "src/components/Button.tsx",
      type: "update",
      before: "export function Button() {\n  return <button>Click</button>\n}",
      after:
        "export function Button({ label }: { label: string }) {\n  return <button>{label}</button>\n}",
      additions: 3,
      deletions: 1,
    },
  },
}

export const Add: Story = {
  args: {
    file: {
      relativePath: "src/utils/format.ts",
      type: "add",
      before: "",
      after: "export function formatName(name: string) {\n  return name.trim()\n}",
      additions: 2,
      deletions: 0,
    },
  },
}

export const Delete: Story = {
  args: {
    file: {
      relativePath: "src/legacy/old-utils.ts",
      type: "delete",
      before: "export const deprecated = true",
      after: "",
      additions: 0,
      deletions: 1,
    },
  },
}
