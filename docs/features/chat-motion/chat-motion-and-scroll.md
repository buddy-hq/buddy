

### Viewport Layout Definition
*   **Viewport Range**: `[1...10]` (where `1` = Screen Top limit, `10` = Screen Bottom limit at input box)
*   **Start Anchor**: `1` (Messages render top-down starting from Position 1)

### State Rules

**State: Empty / Initial**
*   **Condition**: Chat history is empty.
*   **Layout**: The first new message anchors at Position 1.
*   **Scroll Behavior**: None.

**State: Filling**
*   **Condition**: Content is actively being added but does not yet exceed Position 10.
*   **Layout**: New messages append downward (Positions 2 through 10).
*   **Scroll Behavior**: None; content naturally fills available vertical space without moving the scroll position.

**State: Steady State / Full**
*   **Condition**: Existing content height equals or exceeds the viewport height (Position 1 through 10).
*   **Layout**: The screen remains completely filled with content from Position 1 to 10.
*   **Scroll Behavior**: None natively.

**State: Active Generation (Busy)**
*   **Condition**: A generation is in progress while the screen is in Steady State.
*   **Layout**: The viewport remains filled from 1 to 10.
*   **Scroll Behavior**: The viewport smoothly auto-scrolls downward to track new content dynamically, effectively "pushing" older content upward and out of the viewport past Position 1.

**State: Turn Transition (User Action)**
*   **Condition**: The user submits a new message (transitioning from Steady State to Active Generation).
*   **Layout Action**: Immediately push all existing content upward by **30% of the viewport height**.
*   **Result**: The viewport range shifts, creating 30% empty space above Position 10 for the upcoming Active Generation to fill into, seamlessly returning to the Active Generation tracking rule.