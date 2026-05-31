import { describe, expect, test } from "bun:test"
import { MessageID, SessionID } from "@buddy/opencode-adapter/id"
import {
  applyWhiteboardDrawingProgram,
  parseDrawingProgram,
} from "../../src/learning/features/whiteboard/service/program"
import {
  MAX_RETAINED_WHITEBOARD_SCENE_REVISIONS,
  readWhiteboardSession,
  saveWhiteboardLearnerEdit,
} from "../../src/learning/features/whiteboard/service/store"
import {
  WhiteboardPayloadTooLargeError,
  WhiteboardRevisionConflictError,
} from "../../src/learning/features/whiteboard/errors"
import { MAX_WHITEBOARD_PAYLOAD_BYTES } from "../../src/learning/features/whiteboard/service/payload"
import {
  createWhiteboardViewTool,
  readWhiteboardContextTool,
} from "../../src/learning/features/whiteboard/tools/tools"
import type { BuddyToolContext } from "../../src/learning/runtime/create-buddy-tool"
import { tmpdir } from "../helpers/tmpdir"

function createContext(input: { directory: string; sessionID: string }): BuddyToolContext {
  return {
    directory: input.directory,
    sessionID: SessionID.make(input.sessionID),
    messageID: MessageID.make("msg_whiteboard"),
    agent: "buddy",
    abort: new AbortController().signal,
    messages: [],
    metadata: async () => {},
    ask: async () => {},
  }
}

describe("whiteboard drawing program", () => {
  test("creates a fresh scene and continues its latest backend head", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_whiteboard",
      elements: JSON.stringify([
        { type: "cameraUpdate", width: 800, height: 600, x: 0, y: 0 },
        { type: "rectangle", id: "solid", x: 80, y: 100, width: 160, height: 80 },
        {
          type: "arrow",
          id: "melting",
          x: 240,
          y: 140,
          width: 140,
          height: 0,
          points: [
            [0, 0],
            [140, 0],
          ],
        },
      ]),
    })

    const continued = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_whiteboard",
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: created.sceneID },
        { type: "delete", id: "melting" },
        {
          type: "arrow",
          id: "melting-with-heat",
          x: 240,
          y: 140,
          width: 140,
          height: 0,
          points: [
            [0, 0],
            [140, 0],
          ],
        },
      ]),
    })

    expect(continued.sceneID).toBe(created.sceneID)
    expect(continued.state.activeScene?.revisionCount).toBe(3)
    expect(
      continued.state.activeScene?.latestRevision.elements.map((element) => element.id),
    ).toEqual(["solid", "melting-with-heat"])
    expect(continued.state.activeScene?.latestRevision.viewport).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    })

    await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_whiteboard",
      elements: JSON.stringify([
        { type: "rectangle", id: "other-scene", x: 20, y: 20, width: 100, height: 60 },
      ]),
    })
    const resumed = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_whiteboard",
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: created.sceneID },
        { type: "text", id: "phase-label", x: 80, y: 210, text: "Phase transition" },
      ]),
    })

    expect(resumed.sceneID).toBe(created.sceneID)
    expect(resumed.state.activeScene?.revisionCount).toBe(4)
    expect(resumed.state.activeScene?.latestRevision.elements.map((element) => element.id)).toEqual(
      ["solid", "melting-with-heat", "phase-label"],
    )
  })

  test("returns a recoverable camera aspect-ratio hint", async () => {
    await using project = await tmpdir()
    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_camera_hint",
      elements: JSON.stringify([
        { type: "cameraUpdate", width: 500, height: 500, x: 0, y: 0 },
        { type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })

    expect(result.warnings.join("\n")).toContain("cameraUpdate used 500x500")
    expect(result.state.activeScene?.latestRevision.viewport).toEqual({
      x: 0,
      y: 0,
      width: 500,
      height: 500,
    })
  })

  test("returns compact model-facing warnings for basic layout overlaps", async () => {
    await using project = await tmpdir()

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_layout_warnings",
      elements: JSON.stringify([
        { type: "text", id: "label_a", x: 0, y: 0, width: 100, height: 30, text: "Alpha" },
        { type: "text", id: "label_b", x: 20, y: 5, width: 100, height: 30, text: "Beta" },
        { type: "rectangle", id: "box_a", x: 0, y: 80, width: 100, height: 70 },
        { type: "rectangle", id: "box_b", x: 50, y: 100, width: 100, height: 70 },
      ]),
    })

    expect(result.layoutWarnings).toEqual({
      legend: {
        of: "text/label flows outside container",
        lt: "arrow/line crosses text/label",
        tt: "text/label overlaps text/label",
        ss: "sibling shapes overlap",
        ln: "arrow/line nearly touches text/label",
        tn: "text/label nearly touches text/label",
      },
      total: 2,
      hard: [
        ["tt", "label_a", "label_b"],
        ["ss", "box_a", "box_b"],
      ],
      advisory: [],
      hidden: 0,
      action: "roomy_relayout_once_before_reply",
      instruction:
        'Before replying, make at most one roomy relayout whiteboard_create_view call. Start it with restoreCheckpoint and {"type":"layoutCleanup","strategy":"spread_zone"}. Default: create space before local fixes; expand the affected zone and camera to the next 4:3 size, then move related elements together with translate or patch individual coordinates with update. Preserve content and do not add detail. Use pair edits only for 1-2 isolated collisions. If a warning-driven relayout was already attempted in this answer, continue; do not loop.',
    })
  })

  test("returns compact warnings for line-text collisions and near text", async () => {
    await using project = await tmpdir()

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_line_text_warnings",
      elements: JSON.stringify([
        {
          type: "arrow",
          id: "crossing_arrow",
          x: 0,
          y: 10,
          width: 120,
          height: 0,
          points: [
            [0, 0],
            [120, 0],
          ],
        },
        { type: "text", id: "crossed_label", x: 45, y: 0, width: 50, height: 20, text: "Cross" },
        { type: "text", id: "near_a", x: 0, y: 60, width: 45, height: 20, text: "Near A" },
        { type: "text", id: "near_b", x: 54, y: 60, width: 45, height: 20, text: "Near B" },
        {
          type: "arrow",
          id: "near_arrow",
          x: 0,
          y: 130,
          width: 120,
          height: 0,
          points: [
            [0, 0],
            [120, 0],
          ],
        },
        { type: "text", id: "near_label", x: 45, y: 132, width: 50, height: 20, text: "Near" },
      ]),
    })

    expect(result.layoutWarnings).toEqual({
      legend: {
        of: "text/label flows outside container",
        lt: "arrow/line crosses text/label",
        tt: "text/label overlaps text/label",
        ss: "sibling shapes overlap",
        ln: "arrow/line nearly touches text/label",
        tn: "text/label nearly touches text/label",
      },
      total: 3,
      hard: [["lt", "crossing_arrow", "crossed_label"]],
      advisory: [
        ["ln", "near_arrow", "near_label"],
        ["tn", "near_a", "near_b"],
      ],
      hidden: 0,
      action: "roomy_relayout_once_before_reply",
      instruction:
        'Before replying, make at most one roomy relayout whiteboard_create_view call. Start it with restoreCheckpoint and {"type":"layoutCleanup","strategy":"spread_zone"}. Default: create space before local fixes; expand the affected zone and camera to the next 4:3 size, then move related elements together with translate or patch individual coordinates with update. Preserve content and do not add detail. Use pair edits only for 1-2 isolated collisions. If a warning-driven relayout was already attempted in this answer, continue; do not loop.',
    })
  })

  test("caps basic layout warnings before returning them to the model", async () => {
    await using project = await tmpdir()

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_layout_warning_cap",
      elements: JSON.stringify(
        Array.from({ length: 6 }, (_, index) => ({
          type: "text",
          id: `label_${index}`,
          x: 0,
          y: 0,
          width: 100,
          height: 30,
          text: `Label ${index}`,
        })),
      ),
    })

    expect(result.layoutWarnings?.total).toBe(15)
    expect(result.layoutWarnings?.hard).toHaveLength(10)
    expect(result.layoutWarnings?.advisory).toHaveLength(0)
    expect(result.layoutWarnings?.hidden).toBe(5)
  })

  test("keeps advisory-only proximity warnings non-blocking", async () => {
    await using project = await tmpdir()

    const result = await createWhiteboardViewTool.run(
      {
        elements: JSON.stringify([
          { type: "text", id: "near_a", x: 0, y: 0, width: 45, height: 20, text: "Near A" },
          { type: "text", id: "near_b", x: 54, y: 0, width: 45, height: 20, text: "Near B" },
        ]),
      },
      createContext({ directory: project.path, sessionID: "ses_advisory_layout_warning_tool" }),
    )

    expect(result.output).not.toContain("WHITEBOARD ROOMY RELAYOUT REQUIRED BEFORE REPLYING.")
    expect(result.metadata?.layoutWarnings).toEqual({
      legend: {
        of: "text/label flows outside container",
        lt: "arrow/line crosses text/label",
        tt: "text/label overlaps text/label",
        ss: "sibling shapes overlap",
        ln: "arrow/line nearly touches text/label",
        tn: "text/label nearly touches text/label",
      },
      total: 1,
      hard: [],
      advisory: [["tn", "near_a", "near_b"]],
      hidden: 0,
      action: "continue",
      instruction: "Advisory proximity only. Continue unless one cleanup would clearly improve readability.",
    })
  })

  test("does not warn for obvious container or Venn-style shape overlaps", async () => {
    await using project = await tmpdir()

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_layout_warning_false_positives",
      elements: JSON.stringify([
        { type: "rectangle", id: "container", x: 0, y: 0, width: 500, height: 300 },
        { type: "rectangle", id: "child", x: 120, y: 90, width: 120, height: 80 },
        { type: "ellipse", id: "venn_a", x: 700, y: 0, width: 160, height: 120 },
        { type: "ellipse", id: "venn_b", x: 800, y: 0, width: 160, height: 120 },
      ]),
    })

    expect(result.layoutWarnings).toBeUndefined()
  })

  test("includes compact layout warnings in whiteboard create tool output", async () => {
    await using project = await tmpdir()

    const result = await createWhiteboardViewTool.run(
      {
        elements: JSON.stringify([
          { type: "rectangle", id: "box_a", x: 0, y: 0, width: 100, height: 70 },
          { type: "rectangle", id: "box_b", x: 50, y: 20, width: 100, height: 70 },
        ]),
      },
      createContext({ directory: project.path, sessionID: "ses_layout_warning_tool" }),
    )

    expect(result.output).toContain("WHITEBOARD ROOMY RELAYOUT REQUIRED BEFORE REPLYING.")
    expect(result.output).toContain("layoutWarnings:")
    expect(result.output).toContain('"ss","box_a","box_b"')
    expect(result.metadata?.layoutWarnings).toEqual({
      legend: {
        of: "text/label flows outside container",
        lt: "arrow/line crosses text/label",
        tt: "text/label overlaps text/label",
        ss: "sibling shapes overlap",
        ln: "arrow/line nearly touches text/label",
        tn: "text/label nearly touches text/label",
      },
      total: 1,
      hard: [["ss", "box_a", "box_b"]],
      advisory: [],
      hidden: 0,
      action: "roomy_relayout_once_before_reply",
      instruction:
        'Before replying, make at most one roomy relayout whiteboard_create_view call. Start it with restoreCheckpoint and {"type":"layoutCleanup","strategy":"spread_zone"}. Default: create space before local fixes; expand the affected zone and camera to the next 4:3 size, then move related elements together with translate or patch individual coordinates with update. Preserve content and do not add detail. Use pair edits only for 1-2 isolated collisions. If a warning-driven relayout was already attempted in this answer, continue; do not loop.',
    })
  })

  test("returns a hard resize warning when standalone text flows outside a container", async () => {
    await using project = await tmpdir()

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_container_text_overflow",
      elements: JSON.stringify([
        { type: "rectangle", id: "big_idea", x: 0, y: 0, width: 220, height: 100 },
        {
          type: "text",
          id: "big_idea_text",
          x: 20,
          y: 30,
          width: 420,
          height: 24,
          text: "The explanation is much wider than the note container.",
        },
      ]),
    })

    expect(result.layoutWarnings?.hard).toContainEqual(["of", "big_idea_text", "big_idea"])
    expect(result.layoutWarnings?.action).toBe("resize_or_recreate_container_once_before_reply")
  })

  test("returns a hard resize warning when a shorthand label cannot fit its container", async () => {
    await using project = await tmpdir()

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_container_label_overflow",
      elements: JSON.stringify([
        {
          type: "rectangle",
          id: "tiny_note",
          x: 0,
          y: 0,
          width: 120,
          height: 60,
          label: {
            text: "This label needs considerably more vertical room than the tiny note provides.",
          },
        },
      ]),
    })

    expect(result.layoutWarnings?.hard).toContainEqual(["of", "tiny_note", "tiny_note"])
    expect(result.layoutWarnings?.action).toBe("resize_or_recreate_container_once_before_reply")
  })

  test("requests a redraw instead of positional repair for a crowded container zone", async () => {
    await using project = await tmpdir()

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_crowded_zone",
      elements: JSON.stringify([
        { type: "rectangle", id: "background", x: -50, y: -50, width: 700, height: 500 },
        { type: "rectangle", id: "map_zone", x: 0, y: 0, width: 500, height: 300 },
        { type: "rectangle", id: "node_a", x: 50, y: 60, width: 140, height: 90 },
        { type: "rectangle", id: "node_b", x: 90, y: 80, width: 140, height: 90 },
        { type: "rectangle", id: "node_c", x: 130, y: 100, width: 140, height: 90 },
        { type: "rectangle", id: "node_d", x: 170, y: 120, width: 140, height: 90 },
      ]),
    })

    expect(result.layoutWarnings?.action).toBe("redraw_crowded_zone_once_before_reply")
    expect(result.layoutWarnings?.redrawZone).toMatchObject({
      id: "map_zone",
      ids: "map_zone,node_a,node_b,node_c,node_d",
      childCount: 4,
      hardCollisionCount: 6,
      affectedElementCount: 4,
    })
  })

  test("rejects positional edits inside a redraw-zone cleanup", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_redraw_zone_positional_repair",
      elements: JSON.stringify([
        { type: "rectangle", id: "map_zone", x: 0, y: 0, width: 500, height: 300 },
        { type: "rectangle", id: "node_a", x: 50, y: 60, width: 140, height: 90 },
        { type: "rectangle", id: "node_b", x: 90, y: 80, width: 140, height: 90 },
        { type: "rectangle", id: "node_c", x: 130, y: 100, width: 140, height: 90 },
        { type: "rectangle", id: "node_d", x: 170, y: 120, width: 140, height: 90 },
      ]),
    })

    await expect(
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_redraw_zone_positional_repair",
        elements: JSON.stringify([
          { type: "restoreCheckpoint", id: created.sceneID },
          { type: "layoutCleanup", strategy: "redraw_zone", zoneId: "map_zone" },
          { type: "delete", id: "map_zone" },
          { type: "update", id: "node_b", x: 260 },
        ]),
      }),
    ).rejects.toThrow(
      "redraw_zone layoutCleanup must delete and recreate the crowded zone; do not use update or translate.",
    )
  })

  test("rejects redraw-zone cleanup that deletes outside its reported container scope", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_redraw_zone_outside_delete",
      elements: JSON.stringify([
        { type: "rectangle", id: "map_zone", x: 0, y: 0, width: 500, height: 300 },
        { type: "rectangle", id: "node_a", x: 50, y: 60, width: 140, height: 90 },
        { type: "rectangle", id: "node_b", x: 90, y: 80, width: 140, height: 90 },
        { type: "rectangle", id: "node_c", x: 130, y: 100, width: 140, height: 90 },
        { type: "rectangle", id: "node_d", x: 170, y: 120, width: 140, height: 90 },
        { type: "rectangle", id: "outside_note", x: 800, y: 50, width: 160, height: 80 },
      ]),
    })

    await expect(
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_redraw_zone_outside_delete",
        elements: JSON.stringify([
          { type: "restoreCheckpoint", id: created.sceneID },
          { type: "layoutCleanup", strategy: "redraw_zone", zoneId: "map_zone" },
          { type: "delete", ids: "map_zone,node_a,node_b,node_c,node_d,outside_note" },
        ]),
      }),
    ).rejects.toThrow(
      "redraw_zone layoutCleanup must keep elements outside its targeted zone unchanged. Outside deletions: outside_note.",
    )
  })

  test("rejects redraw-zone cleanup that omits a reported container child", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_redraw_zone_missing_child",
      elements: JSON.stringify([
        { type: "rectangle", id: "map_zone", x: 0, y: 0, width: 500, height: 300 },
        { type: "rectangle", id: "node_a", x: 50, y: 60, width: 140, height: 90 },
        { type: "rectangle", id: "node_b", x: 90, y: 80, width: 140, height: 90 },
        { type: "rectangle", id: "node_c", x: 130, y: 100, width: 140, height: 90 },
        { type: "rectangle", id: "node_d", x: 170, y: 120, width: 140, height: 90 },
      ]),
    })

    await expect(
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_redraw_zone_missing_child",
        elements: JSON.stringify([
          { type: "restoreCheckpoint", id: created.sceneID },
          { type: "layoutCleanup", strategy: "redraw_zone", zoneId: "map_zone" },
          { type: "delete", ids: "map_zone,node_a,node_b,node_c" },
        ]),
      }),
    ).rejects.toThrow(
      "redraw_zone layoutCleanup must delete exactly its targeted zone ids before recreating them. Missing deletions: node_d.",
    )
  })

  test("rejects redraw-zone cleanup that recreates elements outside its bounded expansion", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_redraw_zone_outside_addition",
      elements: JSON.stringify([
        { type: "rectangle", id: "map_zone", x: 0, y: 0, width: 500, height: 300 },
        { type: "rectangle", id: "node_a", x: 50, y: 60, width: 140, height: 90 },
        { type: "rectangle", id: "node_b", x: 90, y: 80, width: 140, height: 90 },
        { type: "rectangle", id: "node_c", x: 130, y: 100, width: 140, height: 90 },
        { type: "rectangle", id: "node_d", x: 170, y: 120, width: 140, height: 90 },
      ]),
    })

    await expect(
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_redraw_zone_outside_addition",
        elements: JSON.stringify([
          { type: "restoreCheckpoint", id: created.sceneID },
          { type: "layoutCleanup", strategy: "redraw_zone", zoneId: "map_zone" },
          { type: "delete", ids: "map_zone,node_a,node_b,node_c,node_d" },
          { type: "rectangle", id: "map_zone_redrawn", x: 0, y: 0, width: 800, height: 600 },
          { type: "rectangle", id: "node_a_redrawn", x: 40, y: 60, width: 140, height: 90 },
          { type: "rectangle", id: "node_b_redrawn", x: 240, y: 60, width: 140, height: 90 },
          { type: "rectangle", id: "node_c_redrawn", x: 40, y: 220, width: 140, height: 90 },
          { type: "rectangle", id: "node_d_redrawn", x: 240, y: 220, width: 140, height: 90 },
          { type: "rectangle", id: "outside_redrawn", x: 5_000, y: 5_000, width: 160, height: 80 },
        ]),
      }),
    ).rejects.toThrow(
      "redraw_zone layoutCleanup must recreate only its targeted zone. New elements outside its bounded expansion: outside_redrawn.",
    )
  })

  test("rejects a redraw-zone cleanup with only a marginal collision reduction", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_redraw_zone_marginal",
      elements: JSON.stringify([
        { type: "rectangle", id: "map_zone", x: 0, y: 0, width: 800, height: 600 },
        { type: "rectangle", id: "node_a", x: 40, y: 60, width: 140, height: 90 },
        { type: "rectangle", id: "node_b", x: 80, y: 60, width: 140, height: 90 },
        { type: "rectangle", id: "node_c", x: 280, y: 220, width: 140, height: 90 },
        { type: "rectangle", id: "node_d", x: 320, y: 220, width: 140, height: 90 },
        { type: "rectangle", id: "node_e", x: 520, y: 380, width: 140, height: 90 },
        { type: "rectangle", id: "node_f", x: 560, y: 380, width: 140, height: 90 },
      ]),
    })

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_redraw_zone_marginal",
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: created.sceneID },
        { type: "layoutCleanup", strategy: "redraw_zone", zoneId: "map_zone" },
        { type: "delete", ids: "map_zone,node_a,node_b,node_c,node_d,node_e,node_f" },
        { type: "rectangle", id: "map_zone_redrawn", x: 0, y: 0, width: 1000, height: 750 },
        { type: "rectangle", id: "node_a_redrawn", x: 40, y: 60, width: 140, height: 90 },
        { type: "rectangle", id: "node_b_redrawn", x: 240, y: 60, width: 140, height: 90 },
        { type: "rectangle", id: "node_c_redrawn", x: 280, y: 220, width: 140, height: 90 },
        { type: "rectangle", id: "node_d_redrawn", x: 320, y: 220, width: 140, height: 90 },
        { type: "rectangle", id: "node_e_redrawn", x: 520, y: 380, width: 140, height: 90 },
        { type: "rectangle", id: "node_f_redrawn", x: 560, y: 380, width: 140, height: 90 },
      ]),
    })

    expect(result.saved).toBeFalse()
    expect(result.layoutCleanup).toEqual({
      strategy: "redraw_zone",
      zoneId: "map_zone",
      accepted: false,
      hardBefore: 3,
      hardAfter: 2,
    })
    expect(result.state.activeScene?.latestRevision.elements.map((element) => element.id)).toEqual([
      "map_zone",
      "node_a",
      "node_b",
      "node_c",
      "node_d",
      "node_e",
      "node_f",
    ])
  })

  test("patches existing elements and translates related elements with bound text", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_patch_translate",
      elements: JSON.stringify([
        {
          type: "rectangle",
          id: "node",
          x: 0,
          y: 0,
          width: 120,
          height: 80,
          label: { text: "Node" },
        },
        {
          type: "text",
          id: "node-bound-text",
          containerId: "node",
          x: 20,
          y: 20,
          text: "Node",
        },
      ]),
    })

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_patch_translate",
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: created.sceneID },
        { type: "update", id: "node", x: 10, width: 160, label: { text: "Updated" } },
        { type: "translate", ids: "node", dx: 100, dy: 50 },
      ]),
    })

    expect(result.state.activeScene?.latestRevision.elements).toEqual([
      {
        type: "rectangle",
        id: "node",
        x: 110,
        y: 50,
        width: 160,
        height: 80,
        label: { text: "Updated" },
      },
      {
        type: "text",
        id: "node-bound-text",
        containerId: "node",
        x: 130,
        y: 70,
        text: "Node",
      },
    ])
  })

  test("accepts one marked roomy relayout only when hard collisions decrease", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_cleanup_accept",
      elements: JSON.stringify([
        { type: "rectangle", id: "box_a", x: 0, y: 0, width: 100, height: 70 },
        { type: "rectangle", id: "box_b", x: 50, y: 0, width: 100, height: 70 },
        { type: "rectangle", id: "box_c", x: 300, y: 0, width: 100, height: 70 },
        { type: "rectangle", id: "box_d", x: 350, y: 0, width: 100, height: 70 },
      ]),
    })

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_cleanup_accept",
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: created.sceneID },
        { type: "layoutCleanup", strategy: "spread_zone" },
        { type: "update", id: "box_b", x: 160 },
      ]),
    })

    expect(result.saved).toBeTrue()
    expect(result.layoutCleanup).toEqual({
      strategy: "spread_zone",
      accepted: true,
      hardBefore: 2,
      hardAfter: 1,
    })
    expect(result.state.activeScene?.revisionCount).toBe(3)
    expect(result.layoutWarnings?.hard).toEqual([["ss", "box_c", "box_d"]])
    expect(result.layoutWarnings?.action).toBe("continue_after_roomy_relayout")
  })

  test("rejects a marked roomy relayout that does not reduce hard collisions", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_cleanup_reject",
      elements: JSON.stringify([
        { type: "rectangle", id: "box_a", x: 0, y: 0, width: 100, height: 70 },
        { type: "rectangle", id: "box_b", x: 50, y: 0, width: 100, height: 70 },
      ]),
    })

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_cleanup_reject",
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: created.sceneID },
        { type: "layoutCleanup", strategy: "spread_zone" },
        { type: "update", id: "box_b", x: 20 },
      ]),
    })

    expect(result.saved).toBeFalse()
    expect(result.layoutCleanup).toEqual({
      strategy: "spread_zone",
      accepted: false,
      hardBefore: 1,
      hardAfter: 1,
    })
    expect(result.state.activeScene?.revisionCount).toBe(2)
    expect(result.state.activeScene?.latestRevision.elements).toEqual([
      { type: "rectangle", id: "box_a", x: 0, y: 0, width: 100, height: 70 },
      { type: "rectangle", id: "box_b", x: 50, y: 0, width: 100, height: 70 },
    ])
    expect(result.layoutWarnings?.action).toBe("continue_after_roomy_relayout")
  })

  test("uses the latest learner-edited head and rejects stale learner saves", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_learner_edit",
      elements: JSON.stringify([
        { type: "rectangle", id: "node", x: 20, y: 30, width: 120, height: 60 },
      ]),
    })
    const activeScene = created.state.activeScene
    expect(activeScene).not.toBeNull()
    if (!activeScene) return

    await saveWhiteboardLearnerEdit({
      directory: project.path,
      sessionID: "ses_learner_edit",
      sceneID: created.sceneID,
      edit: {
        baseRevisionID: activeScene.headRevisionID,
        elements: [{ type: "rectangle", id: "node", x: 90, y: 110, width: 120, height: 60 }],
      },
    })

    await expect(
      saveWhiteboardLearnerEdit({
        directory: project.path,
        sessionID: "ses_learner_edit",
        sceneID: created.sceneID,
        edit: {
          baseRevisionID: activeScene.headRevisionID,
          elements: [{ type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 60 }],
        },
      }),
    ).rejects.toBeInstanceOf(WhiteboardRevisionConflictError)

    await expect(
      saveWhiteboardLearnerEdit({
        directory: project.path,
        sessionID: "ses_learner_edit",
        sceneID: created.sceneID,
        edit: {
          baseRevisionID: activeScene.headRevisionID,
          elements: [
            {
              type: "text",
              id: "oversized-note",
              x: 0,
              y: 0,
              text: "x".repeat(MAX_WHITEBOARD_PAYLOAD_BYTES),
            },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(WhiteboardPayloadTooLargeError)

    const afterLearnerEdit = await readWhiteboardSession(project.path, "ses_learner_edit")
    await expect(
      saveWhiteboardLearnerEdit({
        directory: project.path,
        sessionID: "ses_learner_edit",
        sceneID: created.sceneID,
        edit: {
          baseRevisionID: afterLearnerEdit.activeScene?.headRevisionID ?? "",
          elements: [
            {
              type: "image",
              id: "unsupported-image",
              x: 0,
              y: 0,
              width: 120,
              height: 80,
            },
          ],
        },
      }),
    ).rejects.toThrow("Whiteboard element at index 0 has unsupported type 'image'.")

    await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_learner_edit",
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: created.sceneID },
        { type: "text", id: "annotation", x: 90, y: 190, text: "Learner moved this" },
      ]),
    })
    const state = await readWhiteboardSession(project.path, "ses_learner_edit")
    expect(state.activeScene?.latestRevision.elements).toEqual([
      { type: "rectangle", id: "node", x: 90, y: 110, width: 120, height: 60 },
      { type: "text", id: "annotation", x: 90, y: 190, text: "Learner moved this" },
    ])
  })

  test("learner autosaves do not reactivate stale scenes", async () => {
    await using project = await tmpdir()
    const first = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_stale_learner_scene",
      elements: JSON.stringify([
        { type: "rectangle", id: "first_node", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })
    const firstHeadRevisionID = first.state.activeScene?.headRevisionID
    expect(firstHeadRevisionID).toBeString()
    if (!firstHeadRevisionID) return

    const second = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_stale_learner_scene",
      elements: JSON.stringify([
        { type: "rectangle", id: "second_node", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })
    expect(second.sceneID).not.toBe(first.sceneID)

    await expect(
      saveWhiteboardLearnerEdit({
        directory: project.path,
        sessionID: "ses_stale_learner_scene",
        sceneID: first.sceneID,
        edit: {
          baseRevisionID: firstHeadRevisionID,
          elements: [
            { type: "rectangle", id: "first_node", x: 20, y: 20, width: 120, height: 60 },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(WhiteboardRevisionConflictError)

    const state = await readWhiteboardSession(project.path, "ses_stale_learner_scene")
    expect(state.activeScene?.sceneID).toBe(second.sceneID)
    expect(state.activeScene?.latestRevision.elements).toEqual([
      { type: "rectangle", id: "second_node", x: 0, y: 0, width: 120, height: 60 },
    ])
  })

  test("keeps revision ids lexicographically ordered for completed preview replay", async () => {
    await using project = await tmpdir()
    const originalNow = Date.now
    Date.now = () => 1_700_000_000_000
    try {
      const created = await applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_monotonic_revisions",
        elements: JSON.stringify([
          { type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 60 },
        ]),
      })
      const headRevisionID = created.state.activeScene?.headRevisionID
      expect(headRevisionID).toBeString()
      if (!headRevisionID) return

      let baseRevisionID = headRevisionID
      for (let index = 0; index < 8; index += 1) {
        const state = await saveWhiteboardLearnerEdit({
          directory: project.path,
          sessionID: "ses_monotonic_revisions",
          sceneID: created.sceneID,
          edit: {
            baseRevisionID,
            elements: [
              {
                type: "rectangle",
                id: "node",
                x: index,
                y: index,
                width: 120,
                height: 60,
              },
            ],
          },
        })
        const nextRevisionID = state.activeScene?.headRevisionID
        expect(nextRevisionID).toBeString()
        if (!nextRevisionID) return
        baseRevisionID = nextRevisionID
      }
    } finally {
      Date.now = originalNow
    }

    const state = await readWhiteboardSession(project.path, "ses_monotonic_revisions")
    const revisionIDs = state.activeScene?.revisions.map((revision) => revision.revisionID) ?? []
    expect(revisionIDs).toEqual(revisionIDs.toSorted())
  })

  test("caps retained whiteboard revisions to avoid unbounded autosave snapshots", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_revision_retention",
      elements: JSON.stringify([
        { type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })
    const initialRevisionID = created.state.activeScene?.headRevisionID
    expect(initialRevisionID).toBeString()
    if (!initialRevisionID) return

    let baseRevisionID = initialRevisionID
    for (let index = 0; index < MAX_RETAINED_WHITEBOARD_SCENE_REVISIONS + 5; index += 1) {
      const state = await saveWhiteboardLearnerEdit({
        directory: project.path,
        sessionID: "ses_revision_retention",
        sceneID: created.sceneID,
        edit: {
          baseRevisionID,
          elements: [
            {
              type: "rectangle",
              id: "node",
              x: index,
              y: index,
              width: 120,
              height: 60,
            },
          ],
        },
      })
      const nextRevisionID = state.activeScene?.headRevisionID
      expect(nextRevisionID).toBeString()
      if (!nextRevisionID) return
      baseRevisionID = nextRevisionID
    }

    const state = await readWhiteboardSession(project.path, "ses_revision_retention")
    expect(state.activeScene?.revisionCount).toBe(MAX_RETAINED_WHITEBOARD_SCENE_REVISIONS)
    expect(
      state.activeScene?.revisions.some((revision) => revision.revisionID === initialRevisionID),
    ).toBeFalse()
    expect(state.activeScene?.headRevisionID).toBe(baseRevisionID)
  })

  test("rebases concurrent continuation writes against the latest locked head", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_concurrent_agent_writes",
      elements: JSON.stringify([
        { type: "rectangle", id: "base", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })

    await Promise.all([
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_concurrent_agent_writes",
        elements: JSON.stringify([
          { type: "restoreCheckpoint", id: created.sceneID },
          { type: "text", id: "first", x: 0, y: 90, text: "First" },
        ]),
      }),
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_concurrent_agent_writes",
        elements: JSON.stringify([
          { type: "restoreCheckpoint", id: created.sceneID },
          { type: "text", id: "second", x: 0, y: 130, text: "Second" },
        ]),
      }),
    ])

    const state = await readWhiteboardSession(project.path, "ses_concurrent_agent_writes")
    const latestIDs = state.activeScene?.latestRevision.elements.map((element) => element.id)
    expect(state.activeScene?.revisionCount).toBe(4)
    expect(new Set(latestIDs)).toEqual(new Set(["base", "first", "second"]))
  })

  test("returns actionable drawing-program parse errors", () => {
    expect(() => parseDrawingProgram('{"type":"rectangle"}')).toThrow(
      "Whiteboard elements must decode to a JSON array.",
    )
    expect(() => parseDrawingProgram("[")).toThrow(
      "Whiteboard elements must be a valid compact JSON array string.",
    )
    expect(() => parseDrawingProgram(" ".repeat(MAX_WHITEBOARD_PAYLOAD_BYTES + 1))).toThrow(
      `Whiteboard drawing program exceeds ${MAX_WHITEBOARD_PAYLOAD_BYTES} bytes.`,
    )
  })

  test("skips invalid drawn elements instead of failing the whole drawing", async () => {
    await using project = await tmpdir()

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_invalid_element",
      elements: JSON.stringify([
        { type: "cameraUpdate", width: 800, height: 600, x: 0, y: 0 },
        { type: "image", id: "img", x: 0, y: 0, width: 120, height: 80 },
        { type: "rectangle", id: "kept", x: 20, y: 20, width: 120, height: 80 },
        { type: "rectangle", id: "missing-y", x: 20, width: 120, height: 80 },
        { type: "rectangle", id: "kept", x: 200, y: 20, width: 120, height: 80 },
        { id: "missing-type", x: 0, y: 0, width: 120, height: 80 },
      ]),
    })

    const state = await readWhiteboardSession(project.path, "ses_invalid_element")
    expect(state.activeScene?.latestRevision.elements).toEqual([
      { type: "rectangle", id: "kept", x: 20, y: 20, width: 120, height: 80 },
    ])
    expect(result.warnings.length).toBe(4)
    expect(result.warnings.join("\n")).toContain("unsupported type 'image'")
    expect(result.warnings.join("\n")).toContain("duplicate live whiteboard element id 'kept'")
  })

  test("does not save a blank revision when every drawable element is invalid", async () => {
    await using project = await tmpdir()

    await expect(
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_blank_invalid",
        elements: JSON.stringify([
          { type: "cameraUpdate", width: 800, height: 600, x: 0, y: 0 },
          { type: "image", id: "img", x: 0, y: 0, width: 120, height: 80 },
          { id: "missing-type", x: 0, y: 0, width: 120, height: 80 },
        ]),
      }),
    ).rejects.toThrow(
      "Whiteboard program did not contain any valid drawable elements, so no revision was saved.",
    )

    const state = await readWhiteboardSession(project.path, "ses_blank_invalid")
    expect(state.activeScene).toBeNull()
  })

  test("does not save a no-op revision when every continuation edit is skipped", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_noop_invalid",
      elements: JSON.stringify([
        { type: "rectangle", id: "existing", x: 0, y: 0, width: 120, height: 80 },
      ]),
    })

    await expect(
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_noop_invalid",
        elements: JSON.stringify([
          { type: "restoreCheckpoint", id: created.sceneID },
          { type: "image", id: "img", x: 0, y: 0, width: 120, height: 80 },
        ]),
      }),
    ).rejects.toThrow(
      "Whiteboard program did not make any valid changes, so no revision was saved.",
    )

    const state = await readWhiteboardSession(project.path, "ses_noop_invalid")
    expect(state.activeScene?.revisionCount).toBe(created.state.activeScene?.revisionCount)
  })

  test("normalizes malformed labels instead of failing the whole drawing", async () => {
    await using project = await tmpdir()

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_invalid_label",
      elements: JSON.stringify([
        {
          type: "rectangle",
          id: "node",
          x: 0,
          y: 0,
          width: 120,
          height: 80,
          label: { value: "Node" },
        },
        {
          type: "ellipse",
          id: "empty-label",
          x: 160,
          y: 0,
          width: 120,
          height: 80,
          label: { value: "" },
        },
      ]),
    })

    expect(result.state.activeScene?.latestRevision.elements).toEqual([
      {
        type: "rectangle",
        id: "node",
        x: 0,
        y: 0,
        width: 120,
        height: 80,
        label: { value: "Node", text: "Node" },
      },
      {
        type: "ellipse",
        id: "empty-label",
        x: 160,
        y: 0,
        width: 120,
        height: 80,
      },
    ])
  })

  test("read context includes visible learner text and latest edit summary", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_read_context",
      elements: JSON.stringify([
        {
          type: "rectangle",
          id: "solid",
          x: 0,
          y: 0,
          width: 120,
          height: 80,
          label: { text: "Solid" },
        },
      ]),
    })
    const activeScene = created.state.activeScene
    expect(activeScene).not.toBeNull()
    if (!activeScene) return

    await saveWhiteboardLearnerEdit({
      directory: project.path,
      sessionID: "ses_read_context",
      sceneID: created.sceneID,
      edit: {
        baseRevisionID: activeScene.headRevisionID,
        elements: [
          {
            type: "rectangle",
            id: "solid",
            x: 0,
            y: 0,
            width: 120,
            height: 80,
            label: { text: "Solid" },
          },
          {
            type: "text",
            id: "learner-note",
            x: 160,
            y: 0,
            text: "Particles are packed tightly",
          },
        ],
      },
    })

    const result = await readWhiteboardContextTool.run(
      {},
      createContext({ directory: project.path, sessionID: "ses_read_context" }),
    )
    const output = JSON.parse(result.output) as {
      visibleText: Array<{ id: string; type: string; text: string }>
      latestLearnerEditSummary?: { added?: string[] }
    }

    expect(output.visibleText).toEqual([
      { id: "solid", type: "rectangle", text: "Solid" },
      { id: "learner-note", type: "text", text: "Particles are packed tightly" },
    ])
    expect(output.latestLearnerEditSummary?.added?.join("\n")).toContain(
      'text "Particles are packed tightly" (learner-note)',
    )
  })
})
