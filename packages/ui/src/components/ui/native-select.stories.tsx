import type { Meta, StoryObj } from "@storybook/react-vite"

import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "./native-select"

const meta: Meta<typeof NativeSelect> = {
  title: "UI/NativeSelect",
  component: NativeSelect,
  argTypes: {
    size: {
      control: "radio",
      options: ["default", "sm"],
    },
    disabled: {
      control: "boolean",
    },
  },
  args: {
    defaultValue: "react",
    size: "default",
    disabled: false,
  },
  parameters: {
    layout: "centered",
  },
  render: (args) => (
    <NativeSelect {...args} className="w-72">
      <NativeSelectOption value="react">React</NativeSelectOption>
      <NativeSelectOption value="vue">Vue</NativeSelectOption>
      <NativeSelectOption value="svelte">Svelte</NativeSelectOption>
      <NativeSelectOption value="solid">Solid</NativeSelectOption>
    </NativeSelect>
  ),
}

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Small: Story = {
  args: {
    size: "sm",
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
  },
}

export const GroupedOptions: Story = {
  render: (args) => (
    <NativeSelect {...args} defaultValue="nextjs" className="w-72">
      <NativeSelectOptGroup label="Frontend">
        <NativeSelectOption value="react">React</NativeSelectOption>
        <NativeSelectOption value="vue">Vue</NativeSelectOption>
        <NativeSelectOption value="svelte">Svelte</NativeSelectOption>
      </NativeSelectOptGroup>
      <NativeSelectOptGroup label="Meta Frameworks">
        <NativeSelectOption value="nextjs">Next.js</NativeSelectOption>
        <NativeSelectOption value="nuxt">Nuxt</NativeSelectOption>
        <NativeSelectOption value="sveltekit">SvelteKit</NativeSelectOption>
      </NativeSelectOptGroup>
    </NativeSelect>
  ),
}
