import type { Meta, StoryObj } from "@storybook/react-vite"
import { ToolEmptyState } from "./tool-empty-state"

const meta = {
  title: "Web/Tools/Shared/ToolEmptyState",
  component: ToolEmptyState,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ToolEmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const DefaultLabel: Story = {
  args: {},
}

export const CustomLabel: Story = {
  args: {
    label: "No search results found",
  },
}
