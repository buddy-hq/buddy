import { useEffect } from "react"
import { UPDATE_CHECK_MENU_COMMAND } from "@buddy/update-contract"
import { z } from "zod"
import { useUpdateCommands } from "@/state/desktop-update"

const MENU_COMMAND_EVENT = "buddy:menu-command"
const menuCommandDetailSchema = z.object({ id: z.string() })

function readMenuCommandID(event: Event): string | undefined {
  if (!(event instanceof CustomEvent)) return undefined
  const parsed = menuCommandDetailSchema.safeParse(event.detail)
  return parsed.success ? parsed.data.id : undefined
}

export function UpdateMenuCommandHandler(props: {
  readonly openUpdateSurface: () => Promise<void>
}) {
  const { check } = useUpdateCommands()
  const { openUpdateSurface } = props

  useEffect(() => {
    const onMenuCommand = (event: Event) => {
      if (readMenuCommandID(event) !== UPDATE_CHECK_MENU_COMMAND) return

      void openUpdateSurface()
        .then(() => check())
        .catch((cause) => console.error("Failed to handle the update menu command", cause))
    }

    window.addEventListener(MENU_COMMAND_EVENT, onMenuCommand)
    return () => window.removeEventListener(MENU_COMMAND_EVENT, onMenuCommand)
  }, [check, openUpdateSurface])

  return null
}
