import { afterEach, describe, expect, test } from "bun:test"
import { Buffer } from "node:buffer"
import {
  loadMarkdownPdfAllowedRoots,
  resolveMarkdownPdfAllowedRoots,
} from "../src/main/markdown-pdf-roots"

describe("markdown PDF allowed roots", () => {
  let server: ReturnType<typeof Bun.serve> | undefined

  afterEach(() => {
    server?.stop(true)
    server = undefined
  })

  test("deduplicates backend-owned Buddy Home, Notes, and open-project roots", () => {
    const sharedRoot = "/Users/example/Buddy"
    expect(
      resolveMarkdownPdfAllowedRoots({
        notebookHome: {
          defaultDirectory: sharedRoot,
          inboxDirectory: `${sharedRoot}/Inbox`,
          inboxName: "Inbox",
          resolvedDirectory: sharedRoot,
        },
        notesDirectory: {
          defaultDirectory: `${sharedRoot}/Notes`,
          resolvedDirectory: sharedRoot,
        },
        openProjects: {
          directories: [sharedRoot],
        },
      }),
    ).toEqual([sharedRoot])
  })

  test("includes currently open project directories outside Buddy Home and Notes", () => {
    const notebookHome = "/Users/example/Buddy"
    const notesDirectory = "/Users/example/Obsidian/Vault"
    const openProject = "/Users/example/Courses/Chem101"
    expect(
      resolveMarkdownPdfAllowedRoots({
        notebookHome: {
          defaultDirectory: notebookHome,
          inboxDirectory: `${notebookHome}/Inbox`,
          inboxName: "Inbox",
          resolvedDirectory: notebookHome,
        },
        notesDirectory: {
          defaultDirectory: `${notebookHome}/Notes`,
          resolvedDirectory: notesDirectory,
        },
        openProjects: {
          directories: [openProject, notebookHome],
        },
      }),
    ).toEqual([notebookHome, notesDirectory, openProject])
  })

  test("loads trusted roots from the authenticated backend API", async () => {
    const username = "buddy"
    const password = "secret"
    const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
    const notebookHome = "/Users/example/Buddy"
    const notesDirectory = "/Users/example/Obsidian/Vault"
    const openProject = "/Users/example/Courses/Chem101"
    server = Bun.serve({
      port: 0,
      fetch(request) {
        if (request.headers.get("authorization") !== authorization) {
          return Response.json({ message: "Unauthorized" }, { status: 401 })
        }
        const pathname = new URL(request.url).pathname
        if (pathname === "/api/global/notebook-home") {
          return Response.json({
            defaultDirectory: notebookHome,
            inboxDirectory: `${notebookHome}/Inbox`,
            inboxName: "Inbox",
            resolvedDirectory: notebookHome,
          })
        }
        if (pathname === "/api/global/notes-directory") {
          return Response.json({
            defaultDirectory: `${notebookHome}/Notes`,
            resolvedDirectory: notesDirectory,
          })
        }
        if (pathname === "/api/open-projects") {
          return Response.json({
            directories: [openProject],
          })
        }
        return Response.json({ message: "Not found" }, { status: 404 })
      },
    })

    await expect(
      loadMarkdownPdfAllowedRoots({
        backendUrl: server.url.toString(),
        username,
        password,
      }),
    ).resolves.toEqual([notebookHome, notesDirectory, openProject])
  })

  test("fails closed when the backend cannot resolve a root", async () => {
    server = Bun.serve({
      port: 0,
      fetch() {
        return Response.json({ message: "Unavailable" }, { status: 503 })
      },
    })

    await expect(
      loadMarkdownPdfAllowedRoots({
        backendUrl: server.url.toString(),
        username: "buddy",
        password: "secret",
      }),
    ).rejects.toThrow("Could not resolve Markdown PDF roots")
  })

  test("fails closed when open projects cannot be resolved", async () => {
    const notebookHome = "/Users/example/Buddy"
    const notesDirectory = "/Users/example/Obsidian/Vault"
    server = Bun.serve({
      port: 0,
      fetch(request) {
        const pathname = new URL(request.url).pathname
        if (pathname === "/api/global/notebook-home") {
          return Response.json({
            defaultDirectory: notebookHome,
            inboxDirectory: `${notebookHome}/Inbox`,
            inboxName: "Inbox",
            resolvedDirectory: notebookHome,
          })
        }
        if (pathname === "/api/global/notes-directory") {
          return Response.json({
            defaultDirectory: `${notebookHome}/Notes`,
            resolvedDirectory: notesDirectory,
          })
        }
        if (pathname === "/api/open-projects") {
          return Response.json({ message: "Unavailable" }, { status: 503 })
        }
        return Response.json({ message: "Not found" }, { status: 404 })
      },
    })

    await expect(
      loadMarkdownPdfAllowedRoots({
        backendUrl: server.url.toString(),
        username: "buddy",
        password: "secret",
      }),
    ).rejects.toThrow("Could not resolve Markdown PDF roots")
  })
})
