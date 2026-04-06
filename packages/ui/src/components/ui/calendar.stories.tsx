import type { Meta, StoryObj } from "@storybook/react-vite"
import * as React from "react"
import { addDays } from "date-fns"
import { action } from "storybook/actions"
import { expect, userEvent } from "storybook/test"

import { Calendar } from "./calendar"

/**
 * A date field component that allows users to enter and edit date.
 */
type CalendarArgs = {
  mode?: "single" | "multiple" | "range"
  disabled?: boolean | Date[]
  numberOfMonths?: number
  showOutsideDays?: boolean
  selected?: Date | Date[] | { from?: Date; to?: Date }
  onSelect?: (date: unknown) => void
  className?: string
  defaultMonth?: Date
  min?: number
}

const meta: Meta<CalendarArgs> = {
  title: "UI/Calendar",
  argTypes: {
    mode: {
      table: {
        disable: true,
      },
    },
    disabled: {
      control: "boolean",
    },
    numberOfMonths: {
      control: "number",
      description: "Number of months to display",
    },
    showOutsideDays: {
      control: "boolean",
      description: "Show days that fall outside the current month",
    },
  },
  args: {
    mode: "single",
    selected: new Date(),
    onSelect: action("onDayClick"),
    className: "rounded-md border w-fit",
    disabled: false,
    numberOfMonths: 1,
    showOutsideDays: true,
  },
  parameters: {
    layout: "centered",
  },
} satisfies Meta<CalendarArgs>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The default form of the calendar.
 */
export const Default: Story = {}

/**
 * Use the `multiple` mode to select multiple dates.
 */
export const Multiple: Story = {
  args: {
    min: 1,
    selected: [new Date(), addDays(new Date(), 2), addDays(new Date(), 8)],
    mode: "multiple",
  },
}

/**
 * Use the `range` mode to select a range of dates.
 */
export const Range: Story = {
  args: {
    selected: {
      from: new Date(),
      to: addDays(new Date(), 7),
    },
    mode: "range",
  },
}

/**
 * Use the `disabled` prop to disable specific dates.
 */
export const Disabled: Story = {
  args: {
    disabled: [
      addDays(new Date(), 1),
      addDays(new Date(), 2),
      addDays(new Date(), 3),
      addDays(new Date(), 5),
    ],
  },
}

/**
 * Use the `numberOfMonths` prop to display multiple months.
 */
export const MultipleMonths: Story = {
  args: {
    numberOfMonths: 2,
    showOutsideDays: false,
  },
}

export const ShouldNavigateMonthsWhenClicked: Story = {
  name: "when using the calendar navigation, should change months",
  args: {
    defaultMonth: new Date(2000, 8),
  },
  play: async ({ canvas }) => {
    const title = await canvas.findByText(/2000/i)
    const startTitle = title.textContent || ""
    const backBtn = await canvas.findByRole("button", {
      name: /previous/i,
    })
    const nextBtn = await canvas.findByRole("button", {
      name: /next/i,
    })
    const steps = 6
    for (let i = 0; i < steps / 2; i++) {
      await userEvent.click(backBtn)
      expect(title).not.toHaveTextContent(startTitle)
    }
    for (let i = 0; i < steps; i++) {
      await userEvent.click(nextBtn)
      if (i === steps / 2 - 1) {
        expect(title).toHaveTextContent(startTitle)
        continue
      }
      expect(title).not.toHaveTextContent(startTitle)
    }
  },
}
