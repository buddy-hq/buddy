import type { Meta, StoryObj } from "@storybook/react-vite"
import { ToolOutputPanel } from "./tool-output-panel"

const meta = {
  title: "Web/Tools/Shared/ToolOutputPanel",
  component: ToolOutputPanel,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ToolOutputPanel>

export default meta
type Story = StoryObj<typeof meta>

export const ShortOutput: Story = {
  args: {
    output: "Built successfully in 3.2s",
    copyLabel: "Copy output",
  },
}

export const MultiLineOutput: Story = {
  args: {
    output: `src/components/App.tsx  →  dist/App.js
src/utils/helpers.ts   →  dist/helpers.js
src/types/index.ts     →  dist/index.d.ts

3 files transformed in 1.8s`,
    copyLabel: "Copy build output",
  },
}

export const LongOutput: Story = {
  args: {
    output: Array.from({ length: 80 }, (_, i) => `Line ${i + 1}: ${"x".repeat(60)}`).join("\n"),
    copyLabel: "Copy output",
  },
}
