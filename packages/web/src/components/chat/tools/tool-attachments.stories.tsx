import type { Meta, StoryObj } from "@storybook/react-vite"
import { ToolAttachmentGallery } from "./tool-attachments"

const meta = {
  title: "Web/Tools/Shared/ToolAttachmentGallery",
  component: ToolAttachmentGallery,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ToolAttachmentGallery>

export default meta
type Story = StoryObj<typeof meta>

export const ImageAttachment: Story = {
  args: {
    attachments: [
      {
        id: "att-1",
        mime: "image/png",
        url: "https://placehold.co/400x200/png",
        filename: "chart.png",
      },
    ],
  },
}

export const MultipleAttachments: Story = {
  args: {
    attachments: [
      {
        id: "att-1",
        mime: "image/png",
        url: "https://placehold.co/400x200/png",
        filename: "figure-1.png",
      },
      {
        id: "att-2",
        mime: "image/svg+xml",
        url: "https://placehold.co/300x300/svg",
        filename: "diagram.svg",
      },
      {
        id: "att-3",
        mime: "application/pdf",
        url: "https://example.com/report.pdf",
        filename: "report.pdf",
      },
    ],
  },
}

export const PdfOnly: Story = {
  args: {
    attachments: [
      {
        id: "att-1",
        mime: "application/pdf",
        url: "https://example.com/worksheet.pdf",
        filename: "worksheet.pdf",
      },
    ],
  },
}

export const Empty: Story = {
  args: {
    attachments: [],
  },
}
