import type { Meta, StoryObj } from "@storybook/react-vite"
import { t } from "@/i18n"
import { BasicTool } from "./basic-tool"
import { TerminalIcon, FileTextIcon, SearchIcon } from "lucide-react"

const meta = {
  title: "Web/Tools/Shared/BasicTool",
  component: BasicTool,
  parameters: { layout: "padded" },
} satisfies Meta<typeof BasicTool>

export default meta
type Story = StoryObj<typeof meta>

export const Completed: Story = {
  args: {
    trigger: { title: t("chatTools.info.shell"), subtitle: "npm run build" },
    status: "completed",
    children: <pre className="text-xs">Build completed in 2.1s</pre>,
  },
}

export const Running: Story = {
  args: {
    trigger: { title: t("chatTools.info.shell.running"), subtitle: "npm test" },
    status: "running",
  },
}

export const Pending: Story = {
  args: {
    trigger: { title: t("chatTools.info.shell.running"), subtitle: "echo hello" },
    status: "pending",
  },
}

export const Error: Story = {
  args: {
    trigger: { title: t("chatTools.info.shell"), subtitle: "npm run build" },
    status: "error",
    defaultOpen: true,
    children: <pre className="text-xs text-red-500">Build failed with 3 errors</pre>,
  },
}

export const WithIcon: Story = {
  args: {
    icon: <TerminalIcon className="h-3.5 w-3.5" />,
    trigger: { title: t("chatTools.info.shell"), subtitle: "executing script" },
    status: "running",
  },
}

export const WithArgs: Story = {
  args: {
    icon: <FileTextIcon className="h-3.5 w-3.5" />,
    trigger: {
      title: t("chatTools.info.read"),
      subtitle: "3 files",
      args: ["App.tsx", "utils.ts", "index.ts"],
    },
    status: "completed",
  },
}

export const WithAction: Story = {
  args: {
    icon: <SearchIcon className="h-3.5 w-3.5" />,
    trigger: {
      title: t("chatTools.info.grep"),
      subtitle: "12 results",
      action: <span className="text-xs text-text-interactive-base">View all</span>,
    },
    status: "completed",
  },
}

export const CustomTrigger: Story = {
  args: {
    trigger: <span className="text-xs font-medium text-text-weak">Custom trigger element</span>,
    status: "completed",
    children: <div className="text-xs">Some content here</div>,
  },
}

export const HideStatus: Story = {
  args: {
    trigger: { title: t("chatTools.info.shell"), subtitle: "npm run build" },
    status: "completed",
    hideStatus: true,
  },
}

export const HideDetails: Story = {
  args: {
    trigger: { title: t("chatTools.info.read"), subtitle: "file.ts" },
    status: "completed",
    hideDetails: true,
    children: <div className="text-xs">Loaded 3 files</div>,
  },
}

export const DefaultOpen: Story = {
  args: {
    trigger: { title: t("chatTools.info.shell"), subtitle: "npm run build" },
    status: "completed",
    defaultOpen: true,
    children: (
      <pre className="text-xs whitespace-pre-wrap">
        Built successfully in 3.2s\n12 modules transformed
      </pre>
    ),
  },
}
