import { AbsoluteFill, Series } from "remotion"

import { LAUNCH_TIMELINE, SLOT_CANVAS_DURATION_FRAMES } from "../timeline/launchTimeline"
import type { LaunchTimelineEntry } from "../timeline/launchTimeline"
import { SceneSlot } from "./SceneSlot"
import { SceneTransition } from "./SceneTransition"

const getTimelineOffset = (entry: LaunchTimelineEntry): number => {
  return entry.offsetInFrames ?? 0
}

export const LaunchSlotCanvas = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <Series>
        {LAUNCH_TIMELINE.map((entry) => (
          <Series.Sequence
            key={entry.id}
            durationInFrames={entry.durationInFrames}
            offset={getTimelineOffset(entry)}
          >
            {entry.kind === "scene" ? (
              <SceneSlot slot={entry} />
            ) : (
              <SceneTransition transition={entry} />
            )}
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  )
}

export { SLOT_CANVAS_DURATION_FRAMES }
