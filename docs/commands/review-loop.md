# Review Loop
You will conduct code review in two phases.

## Phase 1: Self-review
- review the code changes with verbatim instructions from: `docs/commands/review.md`
  - patch the findings.
- reviewing the code yourself will give you context for the subagent reviews and findings that follow.

## Phase 2: Sub-agent Loop 
1. dispatch a subagent with 
  1. exact instrucions in `docs/commands/review.md`
    2. review instructions should be sent verbatim.
  2. plan/design/end-state arifact: append the verbatim instructions with any artifacts that might help the review agent to keep the review relevant to the intent.
2. verify that the findings are real.
  3. manually verify the issues
    - are real or hallucinated?
    - have they seen the whole picture? Or is the exploration shallow?
3. patch the findings it reports.
4. back to step 1 until no findings are reported or none of the findings are significant: agent starts recommending cosmetic changes, back to back reviews only p3, tast/stylistic suggestions.


## Post Summarization
- if you are just reading the chat summary and it asked you to read this file, you are meant to go into the loop.