import { createLearnerEvent } from "../storage"
import { EvaluationFixtureSchema, type EvaluationFixture } from "../types"

const BASE_TIME = "2026-04-28T10:"

function at(minute: string): string {
  return `${BASE_TIME}${minute}:00.000Z`
}

const defaultEvaluationFixtures: EvaluationFixture[] = EvaluationFixtureSchema.array().parse([
  {
    id: "fixture_greeting_only",
    title: "Greeting only",
    expected: {
      shouldExtract: false,
      notes: ["No learner model update should be produced from greetings."],
      rejectIfContains: ["likes greetings"],
    },
    messages: [
      { id: "msg_greet_1", role: "user", createdAt: at("00"), text: "hi" },
      { id: "msg_greet_2", role: "assistant", createdAt: at("00"), text: "Hi.", outputTokens: 8 },
    ],
    learningEvents: [],
  },
  {
    id: "fixture_ambiguous_preference",
    title: "Ambiguous preference statement",
    expected: {
      shouldExtract: false,
      notes: ["One casual preference should not become a durable learner trait."],
      rejectIfContains: ["prefers examples", "always wants examples"],
    },
    messages: [
      {
        id: "msg_pref_1",
        role: "user",
        createdAt: at("01"),
        text: "Maybe examples are better here, not sure.",
      },
      {
        id: "msg_pref_2",
        role: "assistant",
        createdAt: at("02"),
        text: "Here is an example.",
        outputTokens: 120,
      },
    ],
    learningEvents: [],
  },
  {
    id: "fixture_deep_tutoring",
    title: "Deep tutoring on Electron bridge validation",
    projectPath: "/Users/prashantbhudwal/Code/buddy",
    expected: {
      shouldExtract: true,
      notes: ["Should produce one fragile-skill/open-loop candidate with source pointers."],
      memoryTypes: ["fragile_skill", "open_loop"],
    },
    messages: [
      {
        id: "msg_deep_1",
        role: "user",
        createdAt: at("03"),
        text: "I can wire the UI action, but I keep getting confused about where bridge validation should live.",
      },
      {
        id: "msg_deep_2",
        role: "assistant",
        createdAt: at("04"),
        text: "Let's compare UI validation, backend route validation, and bridge validation.",
        outputTokens: 360,
      },
      {
        id: "msg_deep_3",
        role: "user",
        createdAt: at("06"),
        text: "I think the UI should prevent bad input, but the bridge should still validate because it is the boundary.",
      },
      {
        id: "msg_deep_4",
        role: "assistant",
        createdAt: at("08"),
        text: "That is the right direction. Now define structured errors at the bridge boundary.",
        toolNames: ["read"],
        outputTokens: 620,
      },
      {
        id: "msg_deep_5",
        role: "user",
        createdAt: at("11"),
        text: "I still need practice deciding which layer owns which validation.",
      },
    ],
    learningEvents: [
      createLearnerEvent({
        type: "fixture_session",
        sourceKind: "fixture",
        sourceId: "fixture_deep_tutoring",
        searchableText: "Learner struggled with Electron bridge validation boundaries.",
      }),
    ],
  },
  {
    id: "fixture_cross_project_decoy",
    title: "Cross-project decoy",
    projectPath: "/tmp/unrelated-project",
    expected: {
      shouldExtract: true,
      notes: ["Useful for retrieval decoy tests; should not outrank current Buddy memory."],
      memoryTypes: ["preference", "project_context"],
    },
    messages: [
      {
        id: "msg_decoy_1",
        role: "user",
        createdAt: at("12"),
        text: "In this other project, I prefer theory-first explanations for database indexing.",
      },
      {
        id: "msg_decoy_2",
        role: "assistant",
        createdAt: at("13"),
        text: "Let's start with B-tree theory.",
        outputTokens: 500,
      },
      {
        id: "msg_decoy_3",
        role: "user",
        createdAt: at("15"),
        text: "That helped for this database project.",
      },
      {
        id: "msg_decoy_4",
        role: "assistant",
        createdAt: at("18"),
        text: "We'll keep this project theory-first.",
        outputTokens: 420,
      },
      {
        id: "msg_decoy_5",
        role: "user",
        createdAt: at("20"),
        text: "Use that theory-first style only for this database indexing work.",
      },
      {
        id: "msg_decoy_6",
        role: "user",
        createdAt: at("22"),
        text: "For Buddy bridge code, I still want concrete implementation examples.",
      },
    ],
    learningEvents: [
      createLearnerEvent({
        type: "fixture_session",
        sourceKind: "fixture",
        sourceId: "fixture_cross_project_decoy",
        searchableText:
          "Learner preferred theory-first explanations in an unrelated database project.",
      }),
    ],
  },
  {
    id: "fixture_one_shot_shallow",
    title: "One-shot shallow Q&A",
    expected: {
      shouldExtract: false,
      notes: ["A single answerable question should not create durable memory."],
      rejectIfContains: ["learning style", "struggles with recursion"],
    },
    messages: [
      {
        id: "msg_shallow_1",
        role: "user",
        createdAt: at("23"),
        text: "What does recursion mean?",
      },
      {
        id: "msg_shallow_2",
        role: "assistant",
        createdAt: at("24"),
        text: "Recursion is when a function calls itself with a smaller subproblem.",
        outputTokens: 180,
      },
    ],
    learningEvents: [],
  },
  {
    id: "fixture_verified_success",
    title: "Verified bridge validation success",
    projectPath: "/Users/prashantbhudwal/Code/buddy",
    expected: {
      shouldExtract: true,
      notes: ["Should create evidence from verified task success, not a vague trait."],
      memoryTypes: ["evidence"],
      rejectIfContains: ["good at everything", "expert"],
    },
    messages: [
      {
        id: "msg_success_1",
        role: "user",
        createdAt: at("25"),
        text: "I added structured errors to the Electron bridge and wrote the route validation test.",
      },
      {
        id: "msg_success_2",
        role: "assistant",
        createdAt: at("26"),
        text: "Run the targeted bridge test and check the invalid payload path.",
        toolNames: ["bash"],
        outputTokens: 520,
      },
      {
        id: "msg_success_3",
        role: "user",
        createdAt: at("28"),
        text: "The invalid payload test passes now, and I can explain why renderer checks are not enough.",
      },
      {
        id: "msg_success_4",
        role: "assistant",
        createdAt: at("31"),
        text: "That is verified evidence: you connected boundary validation to a passing route test.",
        outputTokens: 420,
      },
    ],
    learningEvents: [
      createLearnerEvent({
        type: "fixture_session",
        sourceKind: "fixture",
        sourceId: "fixture_verified_success",
        searchableText:
          "Learner verified Electron bridge structured error handling with a passing validation test.",
      }),
    ],
  },
  {
    id: "fixture_explicit_correction",
    title: "Explicit learner correction",
    expected: {
      shouldExtract: false,
      notes: [
        "An explicit correction should be handled by correction APIs, not session extraction.",
      ],
      rejectIfContains: ["prefers theory-first globally"],
    },
    messages: [
      {
        id: "msg_correction_1",
        role: "user",
        createdAt: at("32"),
        text: "Do not remember theory-first as my general preference. That was only for the database project.",
      },
      {
        id: "msg_correction_2",
        role: "assistant",
        createdAt: at("33"),
        text: "I will treat that as project-scoped only.",
        outputTokens: 120,
      },
    ],
    learningEvents: [],
  },
  {
    id: "fixture_contradictory_evidence",
    title: "Contradictory validation evidence",
    projectPath: "/Users/prashantbhudwal/Code/buddy",
    expected: {
      shouldExtract: true,
      notes: [
        "Should surface uncertainty or misconception instead of choosing a false stable trait.",
      ],
      memoryTypes: ["misconception", "open_loop", "fragile_skill"],
      rejectIfContains: ["mastered validation", "always understands"],
    },
    messages: [
      {
        id: "msg_contradiction_1",
        role: "user",
        createdAt: at("34"),
        text: "I thought renderer validation means the backend route can trust the payload.",
      },
      {
        id: "msg_contradiction_2",
        role: "assistant",
        createdAt: at("36"),
        text: "Let's test that assumption by sending a malformed payload directly to the route.",
        toolNames: ["bash"],
        outputTokens: 640,
      },
      {
        id: "msg_contradiction_3",
        role: "user",
        createdAt: at("38"),
        text: "The direct route call bypassed renderer validation, so the route still needs schema validation.",
      },
      {
        id: "msg_contradiction_4",
        role: "assistant",
        createdAt: at("41"),
        text: "Good correction. The remaining practice is recognizing each trust boundary before implementation.",
        outputTokens: 500,
      },
    ],
    learningEvents: [
      createLearnerEvent({
        type: "fixture_session",
        sourceKind: "fixture",
        sourceId: "fixture_contradictory_evidence",
        searchableText:
          "Learner corrected a misconception about renderer validation protecting backend routes.",
      }),
    ],
  },
])

export { defaultEvaluationFixtures }
