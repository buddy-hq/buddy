import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Z_INDEX } from "@buddy/ui/lib/z-index"
import { cssVariables } from "@buddy/ui/lib/utils"
import {
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  Alert02Icon,
  MultiplicationSignCircleIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  // SAFETY: Buddy configures next-themes with the same light, dark, and system values Sonner accepts.
  const sonnerTheme = theme as ToasterProps["theme"]
  const toasterStyle = cssVariables({
    "--normal-bg": "var(--surface-raised-stronger-non-alpha)",
    "--normal-text": "var(--text-base)",
    "--normal-border": "var(--border-base)",
    "--border-radius": "var(--radius)",
    zIndex: Z_INDEX.notification,
  })

  return (
    <Sonner
      theme={sonnerTheme}
      className="toaster group"
      icons={{
        success: <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-4" />,
        info: <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-4" />,
        warning: <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-4" />,
        error: (
          <HugeiconsIcon icon={MultiplicationSignCircleIcon} strokeWidth={2} className="size-4" />
        ),
        loading: (
          <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin" />
        ),
      }}
      style={toasterStyle}
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
