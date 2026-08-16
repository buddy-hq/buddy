import { ObjectRow } from "@/components/objects/object-presentation"
import { describeObject } from "@/components/objects/describe-object"
import {
  OBJECT_KIND_WORKSPACE_FILE,
  OBJECT_STATUS_READY,
  OBJECT_VARIANT_MD,
  type ObjectModel,
  type ObjectPresentationKind,
} from "@/components/objects/types"
import {
  BENCH_MODE_REQUEST_POLICY,
  benchTargetKey,
  readBenchTarget,
  useOpenBench,
  type BenchTarget,
} from "@/lib/bench-navigation"
import { fileNameFromPath } from "@/lib/workspace-file-paths"
import { isChatToolPart } from "../../utils/part-guards"
import { parseToolState } from "../parse-tool-state"
import { readBuddyObjectResult } from "./buddy-object-result"
import type { ToolPartProps } from "../tool-registry-types"
import type { MessagePart } from "@/state/chat-types"
import type { ToolState } from "../types"

/**
 * The receipt a Bench presentation leaves behind.
 *
 * `bench_present` is the one tool whose whole point is that the learner can
 * return to the target later without asking again, so a successful call renders
 * a pointer inline instead of a line in the activity strip. It stays a row and
 * never a card: a reference to the thing, not a copy of it.
 */

type TBenchPresentReceipt = {
  key: string
  target: BenchTarget
  model: ObjectModel
}

type TBenchPresentDescriptorBase = {
  target: BenchTarget
  kind: ObjectPresentationKind
  title: string
  status: typeof OBJECT_STATUS_READY
}

function readBenchPresentReceipt(
  state: ToolState,
  directory: string | undefined,
): TBenchPresentReceipt | undefined {
  if (state.metadata.benchStatus !== "presented") return undefined
  const target = readBenchTarget(state.metadata.benchTarget)
  if (!target) return undefined

  const objectResult = readBuddyObjectResult(state.metadata)
  const summary =
    target.type === "object"
      ? objectResult?.objects.find((object) => object.objectID === target.ref.objectID)
      : undefined
  const kind: ObjectPresentationKind =
    target.type === "object" ? target.ref.kind : OBJECT_KIND_WORKSPACE_FILE
  // A workspace file has no object summary to name it, so the file does.
  const title =
    summary?.title ?? (target.type === "workspace-file" ? fileNameFromPath(target.path) : "")
  if (!title) return undefined

  const descriptor: TBenchPresentDescriptorBase = {
    target,
    kind,
    title,
    status: OBJECT_STATUS_READY,
  }
  return {
    key: benchTargetKey(target),
    target,
    model: describeObject(
      Object.assign(
        descriptor,
        // Lets a presented image show itself rather than a generic file mark.
        directory ? { directory } : undefined,
      ),
    ),
  }
}

function BenchPresentReceiptRow(props: { receipt: TBenchPresentReceipt; directory?: string }) {
  const openBench = useOpenBench()
  const directory = props.directory

  return (
    <ObjectRow
      model={props.receipt.model}
      variant={OBJECT_VARIANT_MD}
      onOpen={
        directory
          ? () =>
              void openBench({
                directory,
                target: props.receipt.target,
                mode: BENCH_MODE_REQUEST_POLICY,
                autoOpen: null,
              })
          : undefined
      }
    />
  )
}

export function renderBenchPresentTool(props: ToolPartProps) {
  const receipt = readBenchPresentReceipt(props.state, props.directory)
  // Active and failed presentations stay in the activity strip. This renderer
  // only handles a completed receipt with an authoritative target.
  if (!receipt) return null

  return <BenchPresentReceiptRow receipt={receipt} directory={props.directory} />
}

/**
 * Consecutive presentations collapse into one band. `bench_present` fires far
 * more often than any other inline-output tool — a single turn can present
 * three things — and repeats of the same target within a band say nothing the
 * first receipt did not.
 */
export function GroupedBenchPresentToolCard(props: { parts: MessagePart[]; directory?: string }) {
  const receipts: TBenchPresentReceipt[] = []
  const seen = new Set<string>()

  for (const part of props.parts) {
    if (!isChatToolPart(part)) continue
    const receipt = readBenchPresentReceipt(parseToolState(part), props.directory)
    if (!receipt || seen.has(receipt.key)) continue
    seen.add(receipt.key)
    receipts.push(receipt)
  }

  if (receipts.length === 0) return null

  return (
    <div className="flex w-full flex-col gap-1.5">
      {receipts.map((receipt) => (
        <BenchPresentReceiptRow key={receipt.key} receipt={receipt} directory={props.directory} />
      ))}
    </div>
  )
}
