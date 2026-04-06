import type { Meta, StoryObj } from "@storybook/react-vite"

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  useComboboxAnchor,
} from "./combobox"

const frameworks = ["React", "Vue", "Svelte", "Solid", "Angular", "Qwik", "Preact"] as const

const meta: Meta<typeof Combobox> = {
  title: "UI/Combobox",
  component: Combobox,
  parameters: {
    layout: "centered",
  },
  render: (args) => (
    <div className="w-80">
      <Combobox {...args} defaultValue="React">
        <ComboboxInput placeholder="Select a framework" showClear />
        <ComboboxContent>
          <ComboboxEmpty>No framework found.</ComboboxEmpty>
          <ComboboxList>
            {frameworks.map((framework) => (
              <ComboboxItem key={framework} value={framework}>
                {framework}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  ),
}

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Disabled: Story = {
  render: (args) => (
    <div className="w-80">
      <Combobox {...args} defaultValue="React">
        <ComboboxInput placeholder="Select a framework" showClear disabled />
        <ComboboxContent>
          <ComboboxList>
            {frameworks.map((framework) => (
              <ComboboxItem key={framework} value={framework}>
                {framework}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  ),
}

export const Grouped: Story = {
  render: (args) => (
    <div className="w-80">
      <Combobox {...args}>
        <ComboboxInput placeholder="Filter frameworks" showClear />
        <ComboboxContent>
          <ComboboxEmpty>No framework found.</ComboboxEmpty>
          <ComboboxList>
            <ComboboxGroup>
              <ComboboxLabel>UI Frameworks</ComboboxLabel>
              <ComboboxItem value="React">React</ComboboxItem>
              <ComboboxItem value="Vue">Vue</ComboboxItem>
              <ComboboxItem value="Svelte">Svelte</ComboboxItem>
            </ComboboxGroup>
            <ComboboxSeparator />
            <ComboboxGroup>
              <ComboboxLabel>Meta Frameworks</ComboboxLabel>
              <ComboboxItem value="Next.js">Next.js</ComboboxItem>
              <ComboboxItem value="Nuxt">Nuxt</ComboboxItem>
              <ComboboxItem value="SvelteKit">SvelteKit</ComboboxItem>
            </ComboboxGroup>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  ),
}

function MultiSelectCombobox() {
  const anchor = useComboboxAnchor()

  return (
    <div className="w-96">
      <Combobox multiple defaultValue={["React", "Vite"]}>
        <div ref={anchor}>
          <ComboboxChips>
            <ComboboxCollection>
              {(item) => <ComboboxChip key={String(item)}>{String(item)}</ComboboxChip>}
            </ComboboxCollection>
            <ComboboxChipsInput placeholder="Add frameworks..." />
          </ComboboxChips>
        </div>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>No framework found.</ComboboxEmpty>
          <ComboboxList>
            {frameworks.map((framework) => (
              <ComboboxItem key={framework} value={framework}>
                {framework}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}

export const MultiSelect: Story = {
  render: () => <MultiSelectCombobox />,
}
