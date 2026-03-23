import type { Meta, StoryObj } from "@storybook/react-vite"

import { DirectionProvider, useDirection } from "./direction"

function DirectionPreview() {
  const dir = useDirection()

  return (
    <div
      dir={dir}
      className="bg-surface-raised-base border-border-base text-text-base flex w-80 flex-col gap-2 rounded-lg border p-4 text-sm"
    >
      <div className="text-text-weak text-xs uppercase tracking-wide">Direction: {dir}</div>
      <div className="flex items-center justify-between">
        <span>Start</span>
        <span>End</span>
      </div>
      <div className="text-text-weak">
        This story verifies spacing, alignment, and text flow for both LTR and RTL.
      </div>
    </div>
  )
}

const meta: Meta<typeof DirectionProvider> = {
  title: "UI/Direction",
  component: DirectionProvider,
  argTypes: {
    direction: {
      control: "radio",
      options: ["ltr", "rtl"],
    },
  },
  args: {
    direction: "ltr",
  },
  parameters: {
    layout: "centered",
  },
  render: (args) => (
    <DirectionProvider {...args}>
      <DirectionPreview />
    </DirectionProvider>
  ),
}

export default meta

type Story = StoryObj<typeof meta>

export const LTR: Story = {}

export const RTL: Story = {
  args: {
    direction: "rtl",
  },
}
