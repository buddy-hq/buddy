import type { Meta, StoryObj } from "@storybook/react-vite"
import { ToolStatusIndicator } from "./tool-header"

const meta = {
  title: "Web/Tools/Shared/ToolStatusIndicator",
  component: ToolStatusIndicator,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ToolStatusIndicator>

export default meta
type Story = StoryObj<typeof meta>

export const Pending: Story = {
  args: { status: "pending" },
}

export const Running: Story = {
  args: { status: "running" },
}

export const Completed: Story = {
  args: { status: "completed" },
}

export const Error: Story = {
  args: { status: "error" },
}
