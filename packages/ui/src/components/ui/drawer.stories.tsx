import type { Meta, StoryObj } from "@storybook/react-vite"
import * as React from "react"

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer"
import { expect, fn, userEvent, within } from "storybook/test"

/**
 * A drawer component for React.
 */
type DrawerArgs = {
  onOpenChange?: (open: boolean) => void
  onClose?: () => void
  onAnimationEnd?: (open: boolean) => void
}

const meta: Meta<DrawerArgs> = {
  title: "UI/Drawer",
  component: Drawer,
  args: {
    onOpenChange: fn(),
    onClose: fn(),
    onAnimationEnd: fn(),
  },
  render: (args) => (
    <Drawer {...args}>
      <DrawerTrigger>Open</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Are you sure absolutely sure?</DrawerTitle>
          <DrawerDescription>This action cannot be undone.</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <DrawerClose className="rounded bg-primary px-4 py-2 text-primary-foreground">
            Submit
          </DrawerClose>
          <DrawerClose className="hover:underline">Cancel</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  ),
  parameters: {
    layout: "centered",
  },
} satisfies Meta<DrawerArgs>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The default form of the drawer.
 */
export const Default: Story = {}

export const ShouldOpenCloseWithSubmit: Story = {
  name: "when clicking Submit button, should close the drawer",
  play: async ({ args, canvasElement, step }) => {
    const canvasBody = within(canvasElement.ownerDocument.body)

    await step("Open the drawer", async () => {
      await userEvent.click(await canvasBody.findByRole("button", { name: /open/i }))
      await expect(args.onOpenChange).toHaveBeenCalled()

      const dialog = await canvasBody.findByRole("dialog")
      expect(dialog).toBeInTheDocument()
      expect(dialog).toHaveAttribute("data-state", "open")
    })

    await step("Close the drawer", async () => {
      await userEvent.click(await canvasBody.findByRole("button", { name: /submit/i }), {
        delay: 100,
      })
      await expect(args.onClose).toHaveBeenCalled()
      expect(await canvasBody.findByRole("dialog")).toHaveAttribute("data-state", "closed")
    })
  },
}

export const ShouldOpenCloseWithCancel: Story = {
  name: "when clicking Cancel button, should close the drawer",
  play: async ({ args, canvasElement, step }) => {
    const canvasBody = within(canvasElement.ownerDocument.body)

    await step("Open the drawer", async () => {
      await userEvent.click(await canvasBody.findByRole("button", { name: /open/i }))
      await expect(args.onOpenChange).toHaveBeenCalled()

      const dialog = await canvasBody.findByRole("dialog")
      expect(dialog).toBeInTheDocument()
      expect(dialog).toHaveAttribute("data-state", "open")
    })

    await step("Close the drawer", async () => {
      await userEvent.click(await canvasBody.findByRole("button", { name: /cancel/i }), {
        delay: 100,
      })
      await expect(args.onClose).toHaveBeenCalled()
      expect(await canvasBody.findByRole("dialog")).toHaveAttribute("data-state", "closed")
    })
  },
}
