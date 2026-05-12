import { BrowserWindow, Menu } from "electron"
import type { MenuItemConstructorOptions } from "electron"

const EDITABLE_CONTEXT_MENU: MenuItemConstructorOptions[] = [
  { role: "undo" },
  { role: "redo" },
  { type: "separator" },
  { role: "cut" },
  { role: "copy" },
  { role: "paste" },
  { type: "separator" },
  { role: "selectAll" },
]

export function wireContextMenu(win: BrowserWindow) {
  win.webContents.on("context-menu", (_event, params) => {
    if (!params.isEditable) return

    Menu.buildFromTemplate(EDITABLE_CONTEXT_MENU).popup({ window: win })
  })
}
