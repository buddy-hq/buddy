<!--this is a workflow command fromt he user.-->
## Wave 2

we develop buddy features in two waves.


### Wave 1: divergence

#### Steps:
- first we brainstorm a design 
- make a spec doc or plan 
- break plan into phases 
- broadly check what the plan does 
- ask agent to go on a coding spree and design the whole thing in one cut.

#### Meaning: 
This phase has minimal reviews, minimal external intervention, minimal human in the loop. The intention of this phase is to diverge and get the first fully funcitonal prototype ready
Usually there are 
- few partially built features
- few bugs 
- few overoptimizations
- few holes 
But, the feature broadly works. 

---

If you are seeing this document, Wave 1 is already done. You will see either a very dirty tree (including markdowns showing the plans/phases/design docs) or user will tell you where to look for outputs from wave 1.

Now it is time for Wave 2.

---


### Wave 2: convergence

Wave 2 is about converging onto a shippable feature. 

####  Wave 1, Issues:
##### Level 1:
P1 Removal of un-nessasary over-optimizations.
  - Divergence Models are really bad at writing good-enough code; they over-engineer - this is fine initially but leads to overly bloated features, random tests, handling of one in a billion edgecases, caring about irrelevant security issues. They brute-force everything, without taste.  
P2 Refactoring the Data flow
  - Divergence model do whatever it takes to get the work done, taking bad routes, making useless apis, not using existing flows.
P3 Refactoring UI
  - Agents sometimes go away fro design language of the app and ship ui with bad primitives.
##### Level 2:
P0: Hunting bugs
  - Agents introduce bugs and regressions. 
  - This should be P0, but we keep it in Level 2 because sometimes bugs are in flow/optimizations we can complelety get rid of in Level 1. This means we spend less time fixing things that will be removed anyway. Hence this is in level 2. 


Expectations: We need to find them. Hunt them. Provide options to the human about the situation, and converge to what they want. Thou shall start the exploration.