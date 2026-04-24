import type { Meta, StoryObj } from "@storybook/react-vite"
import { t } from "@/i18n"
import { ToolHeader } from "./tool-header"

const meta = {
  title: "Web/Tools/Shared/ToolHeader",
  component: ToolHeader,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ToolHeader>

export default meta
type Story = StoryObj<typeof meta>

export const Completed: Story = {
  args: {
    info: { title: t("chatTools.info.shell"), subtitle: "npm run build" },
    status: "completed",
    running: false,
  },
}

export const Running: Story = {
  args: {
    info: { title: t("chatTools.info.shell.running"), subtitle: "npm test", args: ["--watch"] },
    status: "running",
    running: true,
  },
}

export const Error: Story = {
  args: {
    info: { title: t("chatTools.info.edit"), subtitle: "src/App.tsx", detail: "2 changes" },
    status: "error",
    running: false,
  },
}
