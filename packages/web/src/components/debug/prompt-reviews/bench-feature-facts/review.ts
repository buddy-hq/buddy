import benchFeatureBefore from "./bench-feature.before.md?raw"
import { replacePromptSpan, type PromptReview } from "../model"

const tabJobsAndTeachingChoices = `Give each tab a clear job, and at most two at a time, so the user knows what to look at. Its job might be to:
- orient: show the goal or the whole;
- model: show how something is done;
- prompt recall before revealing;
- record ideas, results, or attempts;
- organize them into a structure;
- compare alternatives side by side;
- check: give the user a place to show their thinking;
- preserve a record to come back to;
- focus attention on the one thing that matters now.

- Keep one home tab for a line of work—the board, document, or source the conversation keeps returning to—and extend it for follow-ups rather than starting a new one each time.
- When a source is the evidence, such as a page, passage, figure, or video, keep it selected while you discuss it in chat and point to the exact place.
`

const focusTabLine =
  "- To return to earlier work, focus its tab with `bench_present` `focus_tab` and the exact tab key from the turn context or `bench_read_context`. Browser tabs belong to the user and can't be focused this way; point the user to an open Browser tab rather than opening the same page again. Don't assume an unselected tab is visible, and don't plan on two tabs being visible together.\n"

const readOnceRule = "\n- Don't open the Bench for something the user will read once."

const benchFeatureAfter = [
  [tabJobsAndTeachingChoices, ""],
  [focusTabLine, ""],
  [readOnceRule, ""],
].reduce(
  (prompt, [original, replacement]) => replacePromptSpan(prompt, original, replacement),
  benchFeatureBefore,
)

export const BENCH_FEATURE_FACTS_REVIEW: PromptReview = {
  id: "bench-feature-facts",
  label: "Proposal 03",
  status: "applied",
  title: "Bench prompt: facts only",
  summary:
    "Keep how the Bench behaves; remove the lines that decide how to teach with it; remove the focus_tab line, which repeats the tool descriptions and states a false limit on Browser tabs.",
  note: "One comparison. Applied to the live Bench prompt on 2026-10-01.",
  comparisons: [
    {
      id: "bench-feature",
      target: "features/bench/bench-feature.p.md",
      sourcePath: "packages/buddy/src/learning/features/bench/bench-feature.p.md",
      title: "Describe the Bench, don't direct the lesson",
      explanation:
        "Every persona gets this block whenever the Bench feature is on. Buddy is meant to be a capable teacher that gets an accurate description of its room and decides for itself how to use it. Tab jobs, a home tab, keeping a source selected, and when to open the Bench are teaching choices, so they go. The focus_tab line goes too: how to use focus_tab is already in the bench_present description, not opening a duplicate Browser tab is already in the Browser tool's description, and one visible tab is already the first line of this prompt. It also says Browser tabs can't be focused, which has been false since #103.",
      before: benchFeatureBefore,
      after: benchFeatureAfter,
      beforeSummary: [
        "Nine tab jobs, at most two at a time",
        "Keep one home tab and extend it",
        "Keep a source selected while discussing it",
        "How to use focus_tab (repeats bench_present), Browser tabs said to be unfocusable (false)",
        "Don't open the Bench for something read once",
      ],
      afterSummary: [
        "One tab visible; what each turn reports",
        "Inline objects can move onto the Bench",
        "Say what changed in a short clause",
      ],
      expectedEffects: [
        "Bench use decided by the model, not by our lesson rules",
        "focus_tab guidance comes only from the bench_present and Browser tool descriptions",
        "Watch in evals: a new board per follow-up instead of extending the existing one",
      ],
    },
  ],
}
