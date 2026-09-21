import { app, BrowserWindow, Menu, shell } from "electron"
import type { BaseWindow } from "electron"
import { UPDATE_CHECK_MENU_COMMAND } from "@buddy/update-contract"
import { createMainWindow } from "./windows"

type MenuDeps = {
  updaterEnabled: boolean
  trigger: (id: string, sourceWindow: BaseWindow | undefined) => void
  installCli: () => void
  reload: () => void
  relaunch: () => void
}

export function createMenu(deps: MenuDeps) {
  if (process.platform !== "darwin") return

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Buddy",
      submenu: [
        { role: "about" },
        {
          label: "Check for Updates...",
          enabled: deps.updaterEnabled,
          click: (_menuItem, browserWindow) =>
            deps.trigger(UPDATE_CHECK_MENU_COMMAND, browserWindow),
        },
        {
          label: "Install CLI...",
          enabled: false,
          click: () => deps.installCli(),
        },
        {
          label: "Reload",
          click: () => deps.reload(),
        },
        {
          label: "Restart",
          click: () => deps.relaunch(),
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          // No accelerator: on macOS a menu accelerator takes the key before the page sees it
          // (`registerAccelerator: false` is ignored there). The page owns Cmd+N on every platform.
          label: "New Chat",
          click: (_menuItem, browserWindow) => deps.trigger("chat.new", browserWindow),
        },
        {
          label: "Open Project...",
          accelerator: "Cmd+O",
          click: (_menuItem, browserWindow) => deps.trigger("project.open", browserWindow),
        },
        {
          label: "New Window",
          accelerator: "Cmd+Shift+N",
          click: () =>
            createMainWindow({ updaterEnabled: deps.updaterEnabled, version: app.getVersion() }),
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          // No accelerator, as with New Chat: the page owns Cmd+B so Bench editors keep it for bold.
          label: "Toggle Sidebar",
          click: (_menuItem, browserWindow) => deps.trigger("sidebar.toggle", browserWindow),
        },
        {
          label: "Toggle Terminal",
          accelerator: "Ctrl+`",
          click: (_menuItem, browserWindow) => deps.trigger("terminal.toggle", browserWindow),
        },
        { type: "separator" },
        {
          label: "Back",
          click: (_menuItem, browserWindow) => deps.trigger("common.goBack", browserWindow),
        },
        {
          label: "Forward",
          click: (_menuItem, browserWindow) => deps.trigger("common.goForward", browserWindow),
        },
        { type: "separator" },
        {
          label: "Toggle Developer Tools",
          accelerator: "Alt+Cmd+I",
          click: () => BrowserWindow.getFocusedWindow()?.webContents.toggleDevTools(),
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Buddy Repository",
          click: () => shell.openExternal("https://github.com/buddy-hq/buddy"),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
