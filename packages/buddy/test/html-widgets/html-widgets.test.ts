import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { app } from "../../src/index"
import { BUDDY_OBJECT_KINDS, BuddyObjectResultSchema } from "../../src/objects"
import {
  buildHtmlWidgetObjectRuntimeUrl,
  HtmlWidgetValidationError,
  presentHtmlWidgetObject,
} from "../../src/learning/features/html-widgets/service/store"
import { HTML_WIDGET_RUNTIME_CSP } from "../../src/learning/features/html-widgets/service/types"
import {
  htmlWidgetAutoOpenEventKey,
  presentHtmlWidgetTool,
} from "../../src/learning/features/html-widgets/tools/present-html-widget"
import { createBuddyToolContext } from "../helpers/tools"
import { tmpdir } from "../helpers/tmpdir"
import { parseJsonArray, parseJsonObject, requireJsonObject } from "../helpers/parse"

describe("HTML widget objects", () => {
  test("uses invocation identity for repeated widget auto-open events", () => {
    const firstEventKey = htmlWidgetAutoOpenEventKey({
      objectID: "widget-1",
      sessionID: "session-1",
      messageID: "message-1",
      callID: "call-1",
    })

    expect(
      htmlWidgetAutoOpenEventKey({
        objectID: "widget-1",
        sessionID: "session-1",
        messageID: "message-2",
        callID: "call-2",
      }),
    ).not.toBe(firstEventKey)
  })

  test("adopts a self-contained HTML file and serves it through hardened runtime routes", async () => {
    await using project = await tmpdir({ git: true })
    await fs.mkdir(path.join(project.path, "widgets"), { recursive: true })
    const source = [
      "<!doctype html>",
      "<html>",
      "<head><title>Fractions</title></head>",
      "<body>",
      '<main><button type="button">1/2</button></main>',
      '<img alt="fraction bar" src="./fraction.png">',
      '<script>fetch("https://example.com/fractions.json")</script>',
      "</body>",
      "</html>",
    ].join("\n")
    await fs.writeFile(path.join(project.path, "widgets", "fractions.html"), source, "utf8")

    const widget = await presentHtmlWidgetObject({
      action: "present_path",
      directory: project.path,
      path: "widgets/fractions.html",
      entryPath: null,
      title: "Fraction Builder",
      viewportPreset: "standard_16_10",
      origin: {
        kind: "tool",
        sessionID: "ses_html_widget",
        messageID: "msg_html_widget",
        callID: "call_html_widget",
      },
    })

    expect(widget.manifest.kind).toBe(BUDDY_OBJECT_KINDS.htmlWidget)
    expect(widget.manifest.title).toBe("Fraction Builder")
    expect(widget.manifest.summary.viewportPreset).toBe("standard_16_10")
    expect(widget.sourceRoot).toContain(".buddy/objects/v1/html-widget")
    expect(widget.editPath).toContain("fractions.html")
    expect(widget.originalPath).toBe("widgets/fractions.html")
    expect(widget.originalPathStatus).toBe("moved")
    await expect(fs.stat(path.join(project.path, "widgets", "fractions.html"))).rejects.toThrow()
    expect(widget.manifest.summary.warnings.join("\n")).toContain(
      "Relative asset reference './fraction.png'",
    )
    expect(widget.manifest.summary.warnings.join("\n")).toContain(
      "Network request 'https://example.com/fractions.json'",
    )

    const runtimeResponse = await app.request(
      buildHtmlWidgetObjectRuntimeUrl({
        directory: project.path,
        objectID: widget.manifest.objectID,
        entryPath: widget.entryPath,
        version: widget.inlineData.sourceVersion,
      }),
    )
    expect(runtimeResponse.status).toBe(200)
    expect(runtimeResponse.headers.get("content-security-policy")).toBe(HTML_WIDGET_RUNTIME_CSP)
    expect(runtimeResponse.headers.get("content-security-policy")).toContain(
      "sandbox allow-scripts",
    )
    expect(runtimeResponse.headers.get("content-security-policy")).toContain("navigate-to 'none'")
    expect(runtimeResponse.headers.get("referrer-policy")).toBe("no-referrer")
    expect(runtimeResponse.headers.get("x-content-type-options")).toBe("nosniff")
    expect(await runtimeResponse.text()).toBe(source)

    const sourceResponse = await app.request(
      `/api/objects/html-widget/${widget.manifest.objectID}/source?directory=${encodeURIComponent(project.path)}`,
    )
    expect(sourceResponse.status).toBe(200)
    expect(await sourceResponse.json()).toMatchObject({
      objectID: widget.manifest.objectID,
      path: "fractions.html",
      source,
    })

    const listResponse = await app.request(
      `/api/objects?directory=${encodeURIComponent(project.path)}&kind=html-widget`,
    )
    expect(listResponse.status).toBe(200)
    const list = requireJsonObject(await listResponse.json())
    expect(
      (parseJsonArray(list.objects) ?? []).map((entry) => parseJsonObject(entry)?.objectID),
    ).toContain(widget.manifest.objectID)
  })

  test("blocks source reads that escape the managed source root", async () => {
    await using project = await tmpdir({ git: true })
    await fs.mkdir(path.join(project.path, "widgets"), { recursive: true })
    await fs.writeFile(
      path.join(project.path, "widgets", "safe.html"),
      "<!doctype html><p>Safe widget</p>",
      "utf8",
    )
    const widget = await presentHtmlWidgetObject({
      action: "present_path",
      directory: project.path,
      path: "widgets/safe.html",
      entryPath: null,
      title: "Safe widget",
      viewportPreset: "standard_16_10",
      origin: {
        kind: "tool",
        sessionID: "ses_html_source_containment",
        messageID: "msg_html_source_containment",
        callID: "call_html_source_containment",
      },
    })

    const traversalResponse = await app.request(
      `/api/objects/html-widget/${widget.manifest.objectID}/source?directory=${encodeURIComponent(project.path)}&path=${encodeURIComponent("../object.json")}`,
    )
    expect(traversalResponse.status).toBe(400)

    const outsidePath = path.join(project.path, "outside.html")
    await fs.writeFile(outsidePath, "<!doctype html><p>Outside</p>", "utf8")
    await fs.symlink(outsidePath, path.join(project.path, widget.sourceRoot, "outside-link.html"))
    const symlinkResponse = await app.request(
      `/api/objects/html-widget/${widget.manifest.objectID}/source?directory=${encodeURIComponent(project.path)}&path=outside-link.html`,
    )
    expect(symlinkResponse.status).toBe(400)
  })

  test("registers present_html_widget and returns object metadata", async () => {
    await using project = await tmpdir({ git: true })
    await fs.mkdir(path.join(project.path, "widgets"), { recursive: true })
    await fs.writeFile(
      path.join(project.path, "widgets", "quiz.html"),
      "<!doctype html><button>Start quiz</button>",
      "utf8",
    )
    const result = await presentHtmlWidgetTool.run(
      {
        action: "present_path",
        path: "widgets/quiz.html",
        objectID: null,
        entryPath: null,
        title: "Quick Quiz",
        description: "Try one practice question.",
        viewportPreset: "standard_16_10",
      },
      createBuddyToolContext({
        directory: project.path,
        sessionID: "ses_tool_html_widget",
        messageID: "msg_tool_html_widget",
        agent: "buddy",
      }),
    )

    expect(result.output).toContain("Presented HTML widget Quick Quiz.")
    expect(result.output).toContain("object_kind=html-widget")
    expect(result.output).toContain("object_id=")
    const objectResult = BuddyObjectResultSchema.parse(result.metadata?.buddyObjectResult)
    expect(objectResult.primaryRef?.kind).toBe(BUDDY_OBJECT_KINDS.htmlWidget)
    expect(objectResult.objects[0]?.sourceRoot).toContain(".buddy/objects/v1/html-widget")
    expect(objectResult.presentations[0]?.data?.renderer).toBe("html-widget")
    expect(objectResult.presentations[1]).toMatchObject({
      surface: "bench",
      autoOpen: {
        policyID: "fullscreen-html-widget",
        eventKey: htmlWidgetAutoOpenEventKey({
          objectID: objectResult.primaryRef?.objectID ?? "",
          sessionID: "ses_tool_html_widget",
          messageID: "msg_tool_html_widget",
          callID: null,
        }),
      },
    })

    const objectID = objectResult.primaryRef?.objectID ?? ""
    const sourceResponse = await app.request(
      `/api/objects/html-widget/${objectID}/source?directory=${encodeURIComponent(project.path)}`,
    )
    expect(sourceResponse.status).toBe(200)
    expect(await sourceResponse.json()).toMatchObject({
      objectID,
      source: "<!doctype html><button>Start quiz</button>",
    })
  })

  test("accepts omitted inactive nullable fields for first presentation", async () => {
    await using project = await tmpdir({ git: true })
    await fs.mkdir(path.join(project.path, "widgets"), { recursive: true })
    await fs.writeFile(
      path.join(project.path, "widgets", "omitted-nulls.html"),
      "<!doctype html><p>Omitted null fields</p>",
      "utf8",
    )

    const result = await presentHtmlWidgetTool.run(
      {
        action: "present_path",
        path: "widgets/omitted-nulls.html",
        title: "Omitted Null Fields",
        viewportPreset: "standard_16_10",
      },
      createBuddyToolContext({
        directory: project.path,
        sessionID: "ses_tool_html_widget_omitted_nulls",
        messageID: "msg_tool_html_widget_omitted_nulls",
        agent: "buddy",
      }),
    )

    expect(result.output).toContain("Presented HTML widget Omitted Null Fields.")
    const objectResult = BuddyObjectResultSchema.parse(result.metadata?.buddyObjectResult)
    expect(objectResult.primaryRef?.kind).toBe(BUDDY_OBJECT_KINDS.htmlWidget)
  })

  test("re-presents an already adopted single-file source path", async () => {
    await using project = await tmpdir({ git: true })
    await fs.writeFile(
      path.join(project.path, "consumed-widget.html"),
      "<!doctype html><p>Consumed widget</p>",
      "utf8",
    )

    const first = await presentHtmlWidgetObject({
      action: "present_path",
      directory: project.path,
      path: "consumed-widget.html",
      entryPath: null,
      title: "Consumed Widget",
      viewportPreset: "standard_16_10",
      origin: {
        kind: "tool",
        sessionID: "ses_html_consumed_path",
        messageID: "msg_html_consumed_path",
        callID: "call_html_consumed_path",
      },
    })

    const second = await presentHtmlWidgetObject({
      action: "present_path",
      directory: project.path,
      path: "consumed-widget.html",
      entryPath: null,
      title: "Consumed Widget",
      viewportPreset: "standard_16_10",
      origin: {
        kind: "tool",
        sessionID: "ses_html_consumed_path",
        messageID: "msg_html_consumed_path_retry",
        callID: "call_html_consumed_path_retry",
      },
    })

    expect(second.manifest.objectID).toBe(first.manifest.objectID)
    expect(second.originalPathStatus).toBe("missing")
  })

  test("accepts absolute workspace paths by canonicalizing object source refs", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "absolute-widget.html")
    await fs.writeFile(sourcePath, "<!doctype html><p>Absolute widget</p>", "utf8")

    const widget = await presentHtmlWidgetObject({
      action: "present_path",
      directory: project.path,
      path: sourcePath,
      entryPath: null,
      title: "Absolute Widget",
      viewportPreset: "standard_16_10",
      origin: {
        kind: "tool",
        sessionID: "ses_html_absolute_path",
        messageID: "msg_html_absolute_path",
        callID: "call_html_absolute_path",
      },
    })

    expect(widget.originalPath).toBe("absolute-widget.html")
    expect(widget.originalPathStatus).toBe("moved")
    expect(widget.editPath).toContain("absolute-widget.html")
    await expect(fs.stat(sourcePath)).rejects.toThrow()

    const repeated = await presentHtmlWidgetObject({
      action: "present_path",
      directory: project.path,
      path: sourcePath,
      entryPath: null,
      title: "Absolute Widget",
      viewportPreset: "standard_16_10",
      origin: {
        kind: "tool",
        sessionID: "ses_html_absolute_path",
        messageID: "msg_html_absolute_path_retry",
        callID: "call_html_absolute_path_retry",
      },
    })
    expect(repeated.manifest.objectID).toBe(widget.manifest.objectID)
    expect(repeated.originalPathStatus).toBe("missing")
  })

  test("accepts file URLs that resolve inside the workspace", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "url-widget.html")
    await fs.writeFile(sourcePath, "<!doctype html><p>File URL widget</p>", "utf8")

    const widget = await presentHtmlWidgetObject({
      action: "present_path",
      directory: project.path,
      path: pathToFileURL(sourcePath).href,
      entryPath: null,
      title: "File URL Widget",
      viewportPreset: "standard_16_10",
      origin: {
        kind: "tool",
        sessionID: "ses_html_file_url_path",
        messageID: "msg_html_file_url_path",
        callID: "call_html_file_url_path",
      },
    })

    expect(widget.originalPath).toBe("url-widget.html")
    expect(widget.originalPathStatus).toBe("moved")
  })

  test("rejects absolute widget adoption paths outside the workspace", async () => {
    await using project = await tmpdir({ git: true })
    await using outside = await tmpdir({ git: true })
    const sourcePath = path.join(outside.path, "outside-widget.html")
    await fs.writeFile(sourcePath, "<!doctype html><p>Outside widget</p>", "utf8")

    await expect(
      presentHtmlWidgetObject({
        action: "present_path",
        directory: project.path,
        path: sourcePath,
        entryPath: null,
        title: "Outside Widget",
        viewportPreset: "standard_16_10",
        origin: {
          kind: "tool",
          sessionID: "ses_html_outside_path",
          messageID: "msg_html_outside_path",
          callID: "call_html_outside_path",
        },
      }),
    ).rejects.toThrow("HTML widget source must be inside the workspace.")
  })

  test("rejects non-HTML widget source files", async () => {
    await using project = await tmpdir({ git: true })
    await fs.mkdir(path.join(project.path, "widgets"), { recursive: true })
    await fs.writeFile(path.join(project.path, "widgets", "notes.txt"), "not html", "utf8")

    await expect(
      presentHtmlWidgetObject({
        action: "present_path",
        directory: project.path,
        path: "widgets/notes.txt",
        entryPath: null,
        title: "Notes",
        viewportPreset: "standard_16_10",
        origin: {
          kind: "tool",
          sessionID: "ses_invalid_html_widget",
          messageID: "msg_invalid_html_widget",
          callID: "call_invalid_html_widget",
        },
      }),
    ).rejects.toBeInstanceOf(HtmlWidgetValidationError)
  })

  test("adopts widget folders and serves contained relative assets", async () => {
    await using project = await tmpdir({ git: true })
    const widgetRoot = path.join(project.path, "widgets", "calculator")
    await fs.mkdir(path.join(widgetRoot, "styles"), { recursive: true })
    await fs.writeFile(
      path.join(widgetRoot, "index.html"),
      [
        "<!doctype html>",
        '<link rel="stylesheet" href="./styles/main.css">',
        '<script src="./app.js" defer></script>',
        "<main>Calculator</main>",
      ].join("\n"),
      "utf8",
    )
    await fs.writeFile(
      path.join(widgetRoot, "app.js"),
      "document.body.dataset.ready = 'true'",
      "utf8",
    )
    await fs.writeFile(
      path.join(widgetRoot, "styles", "main.css"),
      "main { color: green; }",
      "utf8",
    )

    const widget = await presentHtmlWidgetObject({
      action: "present_path",
      directory: project.path,
      path: "widgets/calculator",
      entryPath: "index.html",
      title: "Calculator",
      viewportPreset: "standard_16_10",
      origin: {
        kind: "tool",
        sessionID: "ses_html_folder",
        messageID: "msg_html_folder",
        callID: "call_html_folder",
      },
    })

    const runtimeResponse = await app.request(widget.inlineData.runtimeUrl)
    expect(runtimeResponse.status).toBe(200)
    expect(await runtimeResponse.text()).toContain("Calculator")

    const scriptUrl = new URL("./app.js", `http://localhost${widget.inlineData.runtimeUrl}`)
    const scriptResponse = await app.request(`${scriptUrl.pathname}${scriptUrl.search}`)
    expect(scriptResponse.status).toBe(200)
    expect(scriptResponse.headers.get("content-type")).toContain("javascript")
    expect(await scriptResponse.text()).toContain("dataset.ready")

    const stylesheetUrl = new URL(
      "./styles/main.css",
      `http://localhost${widget.inlineData.runtimeUrl}`,
    )
    const stylesheetResponse = await app.request(`${stylesheetUrl.pathname}${stylesheetUrl.search}`)
    expect(stylesheetResponse.status).toBe(200)
    expect(stylesheetResponse.headers.get("content-type")).toContain("text/css")
  })

  test("restores a single-file source when adoption fails before commit", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "widgets", "rollback.html")
    await fs.mkdir(path.dirname(sourcePath), { recursive: true })
    await fs.writeFile(sourcePath, "<!doctype html><p>Restore me</p>", "utf8")

    await expect(
      presentHtmlWidgetObject({
        action: "present_path",
        directory: project.path,
        path: "widgets/rollback.html",
        entryPath: null,
        title: "",
        viewportPreset: "standard_16_10",
        origin: {
          kind: "tool",
          sessionID: "ses_html_rollback",
          messageID: "msg_html_rollback",
          callID: "call_html_rollback",
        },
      }),
    ).rejects.toThrow()

    const restored = await fs.stat(sourcePath)
    expect(restored.isFile()).toBe(true)
    expect(await fs.readFile(sourcePath, "utf8")).toContain("Restore me")
  })

  test("rejects home-relative widget adoption paths outside the workspace", async () => {
    await using project = await tmpdir({ git: true })

    await expect(
      presentHtmlWidgetObject({
        action: "present_path",
        directory: project.path,
        path: "~/widget.html",
        entryPath: null,
        title: "Invalid widget",
        viewportPreset: "standard_16_10",
        origin: {
          kind: "tool",
          sessionID: "ses_html_home_path",
          messageID: "msg_html_home_path",
          callID: "call_html_home_path",
        },
      }),
    ).rejects.toBeInstanceOf(HtmlWidgetValidationError)
  })
})
