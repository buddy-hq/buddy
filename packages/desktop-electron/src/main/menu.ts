import { app, BrowserWindow, Menu, shell } from "electron"
import { createMainWindow } from "./windows"

type MenuDeps = {
  updaterEnabled: boolean
  trigger: (id: string) => void
  installCli: () => void
  checkForUpdates: () => void
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
          click: () => deps.checkForUpdates(),
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
          label: "New Session",
          accelerator: "Shift+Cmd+S",
          click: () => deps.trigger("session.new"),
        },
        {
          label: "Open Project...",
          accelerator: "Cmd+O",
          click: () => deps.trigger("project.open"),
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
          label: "Toggle Sidebar",
          accelerator: "Cmd+B",
          click: () => deps.trigger("sidebar.toggle"),
        },
        {
          label: "Toggle Terminal",
          accelerator: "Ctrl+`",
          click: () => deps.trigger("terminal.toggle"),
        },
        { type: "separator" },
        { label: "Back", click: () => deps.trigger("common.goBack") },
        { label: "Forward", click: () => deps.trigger("common.goForward") },
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
          click: () => shell.openExternal("https://github.com/prashantbhudwal/buddy"),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
