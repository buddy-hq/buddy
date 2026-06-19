import type { Meta, StoryObj } from "@storybook/react-vite"
import { ObjectCard } from "./object-card"

const meta = {
  title: "Web/Tools/Shared/ObjectCard",
  component: ObjectCard,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ObjectCard>

export default meta
type Story = StoryObj<typeof meta>

export const Basic: Story = {
  args: {
    title: "Mermaid Diagram",
    subtitle: "flowchart",
    status: "completed",
    children: (
      <div className="flex items-center justify-center p-8 text-text-weak">
        Diagram content placeholder
      </div>
    ),
  },
}

export const WithBadge: Story = {
  args: {
    title: "Sequence Diagram",
    badge: "SEQUENCE",
    subtitle: "API flow",
    status: "completed",
    children: (
      <div className="flex items-center justify-center p-8 text-text-weak">
        Diagram content placeholder
      </div>
    ),
  },
}

export const Running: Story = {
  args: {
    title: "Generating diagram...",
    status: "running",
    children: (
      <div className="flex items-center justify-center p-8 text-text-weak animate-pulse">
        Generating...
      </div>
    ),
  },
}

export const Error: Story = {
  args: {
    title: "Mermaid Diagram",
    subtitle: "failed to render",
    status: "error",
  },
}

export const WithGrid: Story = {
  args: {
    title: "Grid Diagram",
    subtitle: "with background grid",
    status: "completed",
    showGrid: true,
    children: (
      <div className="flex items-center justify-center p-8 text-text-weak">
        Grid content placeholder
      </div>
    ),
  },
}

export const WithActions: Story = {
  args: {
    title: "Diagram with actions",
    subtitle: "click the button",
    status: "completed",
    actions: (
      <button type="button" className="text-xs text-text-interactive-base hover:underline">
        Download SVG
      </button>
    ),
    children: (
      <div className="flex items-center justify-center p-8 text-text-weak">
        Diagram content placeholder
      </div>
    ),
  },
}
