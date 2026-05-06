- you will conduct code reviews in a loop.

Loop: 
1. dispatch a subagent with exact instrucions in docs/commands/review.md
2. verify that the findings are real.
2. patch the findings it reports.
3. back to step 1 until no findings are reported or none of the findings ar significant. 


Must do's
- instructions should be sent verbatim
- always verify if reported issuees are real or hallucinated.


Post Summarization
- if you are just reading the chat summary and it asked you to read this file, you are meant to go into the loop.