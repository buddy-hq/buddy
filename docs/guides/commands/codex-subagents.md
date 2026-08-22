# use subagents
use subagents for this task. subagents allow you to be the orchestrator and preserve your context.

## model choice
- for model choice almost always choose gpt5.4mini xhigh  
- if the task it too complicated, use gpt 5.3 codex high.
- if the task requires broad world knowledge and product thinking: only then use gpt 5.4 high. never use xhigh variant of gpt 5.4 main model.
- if the task is straight forward or it just requires a lot of waiting a chcking the status of the shell commands: you can use 5.4 mini medium/high depending of how dumb the task is.  

## when not to use subagents: 
- when you already have all the context and the completion just requires a few straight froward edits. - when the tasks can't be done in parallel.  

## caution 
- these are user's preferences and you should treat it like an extension of your own subagent guidelines. not as an explicit override to them.