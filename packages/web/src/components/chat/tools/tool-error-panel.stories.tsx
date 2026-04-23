import type { Meta, StoryObj } from "@storybook/react-vite"
import { ToolErrorPanel } from "./tool-error-panel"

const meta = {
  title: "Web/Tools/Shared/ToolErrorPanel",
  component: ToolErrorPanel,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ToolErrorPanel>

export default meta
type Story = StoryObj<typeof meta>

export const SingleLineError: Story = {
  args: {
    error: "File not found: src/missing-module.ts",
  },
}

export const MultiLineError: Story = {
  args: {
    error: `Build failed with 3 errors:
  
src/App.tsx(5,7): error TS2304: Cannot find name 'foo'.
src/utils.ts(12,1): error TS1005: ';' expected.
src/types.ts(3,15): error TS2322: Type 'string' is not assignable to type 'number'.`,
  },
}

export const LongError: Story = {
  args: {
    error:
      "Error: ECONNREFUSED\n  at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1555:16)\n  at Protocol._enqueue (/node_modules/mysql-protocol/index.js:144:48)\n  at Protocol.handshake (/node_modules/mysql-protocol/index.js:51:23)\n  at PoolConnection.connect (/node_modules/mysql-connection/index.js:116:18)",
  },
}
