import { describe, expect, test } from "bun:test"
import { $getRoot, createEditor } from "lexical"
import {
  BuddyChemistryNode,
  chemistryFormatFromFenceLanguage,
} from "../src/components/bench/markdown-bench-chemistry-plugin"

describe("Markdown Bench chemistry plugin", () => {
  test("recognizes every chemistry fence without changing its authored language", () => {
    expect(chemistryFormatFromFenceLanguage("SMILES")).toBe("smiles")
    expect(chemistryFormatFromFenceLanguage("cxsmiles")).toBe("cxsmiles")
    expect(chemistryFormatFromFenceLanguage("reaction-smiles")).toBe("reaction-smiles")
    expect(chemistryFormatFromFenceLanguage("ket")).toBe("ket")
    expect(chemistryFormatFromFenceLanguage("chemfig")).toBe("chemfig")
    expect(chemistryFormatFromFenceLanguage("mol-v2000")).toBeUndefined()
    expect(chemistryFormatFromFenceLanguage("rxn-v3000")).toBeUndefined()
    expect(chemistryFormatFromFenceLanguage("chemistry")).toBeUndefined()
  })

  test("preserves language, metadata, and source through Lexical serialization", () => {
    const editor = createEditor({
      namespace: "markdown-bench-chemistry-test",
      nodes: [BuddyChemistryNode],
      onError(error) {
        throw error
      },
    })
    let serialized: ReturnType<BuddyChemistryNode["exportJSON"]> | undefined

    editor.update(
      () => {
        const node = new BuddyChemistryNode(
          "smiles",
          "SMILES",
          "C[C@H](O)C(=O)O",
          'alt="Lactic acid" profile=publication',
        )
        $getRoot().append(node)
        serialized = node.exportJSON()
      },
      { discrete: true },
    )

    expect(serialized).toMatchObject({
      format: "smiles",
      language: "SMILES",
      meta: 'alt="Lactic acid" profile=publication',
      source: "C[C@H](O)C(=O)O",
      type: "buddy-chemistry",
      version: 1,
    })
  })

  test("can restore the original source through a retained node reference", () => {
    const editor = createEditor({
      namespace: "markdown-bench-chemistry-stale-node-test",
      nodes: [BuddyChemistryNode],
      onError(error) {
        throw error
      },
    })
    let node: BuddyChemistryNode | undefined
    editor.update(
      () => {
        node = new BuddyChemistryNode("smiles", "smiles", "CCO", null)
        $getRoot().append(node)
      },
      { discrete: true },
    )
    if (!node) throw new Error("Expected a chemistry node.")
    const retainedNode = node

    editor.update(() => retainedNode.setSource("CCC"), { discrete: true })
    editor.update(() => retainedNode.setSource("CCO"), { discrete: true })

    let source: string | undefined
    editor.getEditorState().read(() => {
      source = retainedNode.getSource()
    })
    expect(source).toBe("CCO")
  })
})
