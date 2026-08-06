import { Composition } from "remotion"

import { BuddyLaunch } from "./BuddyLaunch"
import { BUDDY_LAUNCH_DURATION_FRAMES } from "./timeline/launchTimeline"
import {
  BUDDY_LAUNCH_FPS,
  BUDDY_LAUNCH_HEIGHT_PX,
  BUDDY_LAUNCH_WIDTH_PX,
} from "./videoConfig"

export const RemotionRoot = () => {
  return (
    <Composition
      id="BuddyLaunch"
      component={BuddyLaunch}
      durationInFrames={BUDDY_LAUNCH_DURATION_FRAMES}
      fps={BUDDY_LAUNCH_FPS}
      width={BUDDY_LAUNCH_WIDTH_PX}
      height={BUDDY_LAUNCH_HEIGHT_PX}
      defaultProps={{}}
    />
  )
}
