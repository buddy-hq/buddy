## Stay in sync

- the user is dogfooding buddy prod. 0.24
- the session will take long time but they will keep adding their observations in the `scratchpad`: /Users/prashantbhudwal/Documents/obsidian/BuddyDF1.md
- your job is to stay in sync with the observations and find out the root causes of what they are saying.
- you will update `log file`: /Users/prashantbhudwal/Code/buddy/docs/archive/df1.md

## Workflow
- the user gives you these instructions.
- you read the `scratchpad` file.
- you analyze the issue. find the root causes or if it is a real issue or not.
  - you do this by dispatching an exploration subagent. 
- you update your observations in `log file`
  - make sure you add the exact text verbaitim from user `scratchpad`
- then you trigger a sleep command with a poll time of 
  - sleep 120: if the user is still completing a thought or you feel you need more context soon. 
  - sleep 180: in all other cases
- when you wake up from sleep: 
  - ALWAYS read `/Users/prashantbhudwal/Code/buddy/docs/guides/commands/inSync.md` again. 
  - repeat the whole process again. 
- don't stop until user manually interrupts you. this is like stayin in a while loop until user manually interrupts.