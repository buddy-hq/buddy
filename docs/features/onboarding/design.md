# Onboarding

## Objective
- the objective is to improve the buddy's onboarding flow.

## Situation
- the onboarding allows the user to connect with chatgpt or offers to continue with free models.
- once the user selects an option, they are asked to choose 
  - a buddy home
  - or choose another folder
- once they do they they are redirected to the quick chats 

--- 

## Complication
- this onboarding flow was made during early phases of buddy to just get started but buddy has evolved not. it has memory, learner context and many other customizations.
- first the UI design of all of this is a bit off
  - the information design and visual hierarchy is kind of messed up.
  - thee free models thing has no icon but the chat gpt thing has
  - the choose buddy home and the choose another folder are a choice, but whose two items are very differntly styled.
- the user is making just two decisions on the page, and we collect no context of the user at all. does this mean buddy is less intelligent about the user. should we collect more context.
- we are also not using any form libarry, that means if we plan to extend this, we might not have a robust way to do this.

--- 

## Questions
- what would be an ideal onboarding flow based on what buddy is right now
- should we collect any information from the user? or will it be too big a hurdle when it comes to having a smooth onboaring?
  - i am thinking on the lines of the name of the user, 
  - maybe their age/profession/etc. somthing that helps agent decide what pedagogical level to adapt to
    - for example if the user is a researcher, the way buddy behaves should be differernt form how it behaves with a teenager. 
  - what other info is open to dialog?
  - i understand that we may need to store this information locally and we will need to show it to the user too. 
    - if we decide to implement that, this will just go into the personalization tab in settings. wehre maybe we will also move the currents instructions setting. 
- should we use tanstack form?


--- 

## Decisions
<!--locked decisions are based on comments in this doc. open follow-up decisions exist because the chosen direction introduces new architectural work.-->

### Locked Decisions

1. Onboarding will remain setup-first, then offer an optional personalization step.
   - activation still comes first: provider choice, buddy home, initial notebook, redirect path.
   - personalization should be a separate, skippable subflow after setup succeeds.

2. Buddy will add a first-class structured personalization model.
   - this should be separate from the onboarding store.
   - this should also stay separate from learner memory and freeform `AGENTS.md` instructions.

3. Personalization v1 will collect three simple text fields.
   - preferred name
   - occupation
   - more about you
   - all three should stay lightweight and easy to edit later.

4. Personalization will be part of onboarding, but skippable.
   - if a user skips it, they should still be able to complete or edit it later in settings.

5. TanStack Form will be adopted for personalization work.
   - use it for the personalization step and the matching settings editor.
   - this does not require refactoring the provider-selection and buddy-home setup step into a form unless that becomes useful later.

6. Personalization will be stored in Buddy global config for v1.
   - it should be added as a typed, structured field in global config.
   - this keeps onboarding and settings on one backend-owned source of truth.
   - if the domain grows later, it can be split into a dedicated store then.

7. Personalization should reach the runtime through its own dedicated runtime context block.
   - this information is user-declared and should keep its own authority.
   - it should not be merged into learner memory.
   - it should not be silently synchronized into `AGENTS.md`.

8. Personalization scope is global in v1.
   - there is one profile for the user across the app.
   - notebook-specific personalization is out of scope for now.

9. Personalization should become a first-class settings surface.
   - add a dedicated Personalization tab.
   - move the current Instructions editor into that tab rather than keeping a separate Instructions tab.

10. V1 should use the existing global config read/write path for personalization.
   - read personalization through the global config query path.
   - write it through global config patching.
   - onboarding should save only on explicit `Next` or `Skip`.
   - settings should autosave profile edits.

11. Runtime integration should stay isolated.
   - add one new runtime context block for explicit personalization.
   - do not change how vendor-managed instructions are injected.
   - do not change learner-memory insertion.
   - do not add conflict-resolution logic in v1.

12. Only new users should see the personalization step during onboarding.
   - existing users can discover and edit it later from settings.
   - rollout should avoid interrupting established users.

13. Onboarding should stop asking the user to choose Buddy Home.
   - use the default Buddy Home automatically during onboarding.
   - users can still open or create notebooks elsewhere later in the app.
   - Buddy Home should be editable later from settings.
   - for now, that settings control can live in General.

14. Setup completion and personalization completion should be tracked separately.
   - setup completion gets the user into Buddy.
   - personalization completion or skip is tracked independently.
   - this keeps resume/skip behavior explicit without overloading one completion flag.

15. The personalization onboarding step should use a dedicated onboarding version marker.
   - do not rely on the current `no chat context` heuristic as the product definition of a new user.
   - the step should be shown until the dedicated onboarding/profile version is completed.

16. If default Buddy Home setup fails, onboarding should ask for Buddy Home only as recovery.
   - Buddy Home stays out of the happy path.
   - the folder picker becomes a fallback when default setup fails.

17. Personalization and Instructions should share one Personalization tab, but remain clearly separate sections.
   - structured profile fields and freeform `AGENTS.md` instructions need distinct explanations.
   - they should not read like the same authority or storage system.

18. Personalization is completed only by explicit `Next` or `Skip`.
   - onboarding should persist profile changes only on those explicit actions.
   - settings can still autosave independently later.
   - saved draft data must stay separate from step-completion semantics.

19. Personalization should affect all surfaces uniformly in v1.
   - keep the runtime block persona-agnostic.
   - add a simple gate so the block is omitted when no personalization data exists.

### Open Follow-up Decisions

- No additional material architecture decisions are open.
- Remaining questions are implementation details only.

### Remaining Implementation Details

- whether empty personalization fields persist as empty strings or normalize to missing values
- exact autosave debounce behavior in settings
- the precise General settings row for Buddy Home
- the exact runtime-block wording for personalization

---

## Acceptance Criteria

### Onboarding Flow

- [ ] The onboarding flow still begins with provider selection.
- [ ] The onboarding flow no longer asks the user to choose Buddy Home during the normal happy path.
- [ ] The onboarding flow automatically uses the default Buddy Home during the normal happy path.
- [ ] The onboarding flow still supports the existing provider choices required for v1.
- [ ] After setup succeeds, the user is moved to a separate personalization step.
- [ ] The personalization step is explicitly skippable.
- [ ] Skipping personalization still allows the user to enter Buddy successfully.
- [ ] Completing personalization still allows the user to enter Buddy successfully.
- [ ] The onboarding flow does not rely on background autosave during personalization.
- [ ] Clicking `Next` on the personalization step persists the latest personalization data.
- [ ] Clicking `Skip` marks the personalization step as skipped without requiring filled fields.
- [ ] The onboarding flow continues to work when the user chooses the free-model path.
- [ ] The onboarding flow continues to work when the user chooses the ChatGPT/OpenAI path.

### Buddy Home Behavior

- [ ] Buddy Home remains the default root for Buddy-managed notebooks.
- [ ] If default Buddy Home setup succeeds, onboarding does not ask the user to pick a folder.
- [ ] If default Buddy Home setup fails during onboarding, the user is shown a recovery path that lets them pick a Buddy Home manually.
- [ ] The failure recovery path is only shown when default Buddy Home setup actually fails.
- [ ] The failure recovery path still ends in a successful first notebook / quick-chat entry when the user chooses a valid folder.
- [ ] The user can change Buddy Home later from settings.
- [ ] The Buddy Home settings control is discoverable without going back through onboarding.

### Personalization Data Model

- [ ] A first-class structured personalization model exists.
- [ ] The personalization model is stored in Buddy global config for v1.
- [ ] The personalization model is represented as a typed subdocument, not ad hoc untyped fields.
- [ ] The personalization model is separate from the onboarding store.
- [ ] The personalization model is separate from learner memory.
- [ ] The personalization model is separate from `AGENTS.md` instructions.
- [ ] Personalization v1 includes a preferred name field.
- [ ] Personalization v1 includes an occupation field.
- [ ] Personalization v1 includes a `more about you` field.
- [ ] The system behaves correctly when all personalization fields are empty.
- [ ] The system behaves correctly when only some personalization fields are filled.

### Persistence And Lifecycle

- [ ] The web app reads personalization through the existing global config query path.
- [ ] The web app writes personalization through the existing global config patch path.
- [ ] Onboarding persistence happens only on explicit `Next` or `Skip`.
- [ ] Settings persistence happens through autosave.
- [ ] Saved personalization data does not by itself mark onboarding personalization as complete.
- [ ] Personalization completion is tracked separately from setup completion.
- [ ] Setup completion can be true while personalization remains incomplete or skipped.
- [ ] Personalization completion can be true even after onboarding setup has already completed.
- [ ] A dedicated onboarding/profile version marker determines whether the personalization onboarding step should be shown.
- [ ] The product does not rely solely on the current `no local chat context` heuristic to define `new user`.

### Settings Information Architecture

- [ ] Settings contains a first-class `Personalization` tab.
- [ ] The previous `Instructions` content is moved into the `Personalization` tab.
- [ ] Structured personalization fields and `AGENTS.md` instructions appear as clearly separate sections inside that tab.
- [ ] The UI copy makes it clear that structured personalization and freeform instructions are different things.
- [ ] The settings experience allows a user who skipped onboarding personalization to fill it out later.
- [ ] The settings experience allows a user who completed onboarding personalization to edit it later.
- [ ] Settings autosave does not require an explicit submit button for personalization edits.

### Runtime Integration

- [ ] Personalization is delivered to the runtime through its own dedicated runtime context block.
- [ ] The runtime context block is omitted when no personalization data exists.
- [ ] The runtime context block is persona-agnostic in v1.
- [ ] The personalization block affects all surfaces uniformly in v1.
- [ ] Existing vendor-managed instruction injection remains unchanged.
- [ ] Existing learner-memory injection remains unchanged.
- [ ] No new conflict-resolution system is added between personalization and instructions in v1.
- [ ] No new conflict-resolution system is added between personalization and learner memory in v1.

### Rollout Behavior

- [ ] Only users eligible under the new dedicated onboarding/profile version marker see the personalization step in onboarding.
- [ ] Existing users are not forced through the new personalization onboarding step on upgrade.
- [ ] Existing users can still access personalization from settings after the feature ships.
- [ ] New users can complete setup without entering personalization data.
- [ ] New users can complete setup with partial personalization data if they choose to continue.

### Quality And Safety

- [ ] The implementation preserves the current provider-connection behavior unless explicitly changed by this feature.
- [ ] The implementation preserves the current quick-chat / first-notebook entry behavior unless explicitly changed by this feature.
- [ ] The implementation does not silently write user profile data into `AGENTS.md`.
- [ ] The implementation does not store explicit personalization as learner memory.
- [ ] The implementation handles interrupted onboarding without corrupting completion state.
- [ ] The implementation handles interrupted onboarding without losing already persisted personalization data.
- [ ] The implementation handles a skipped personalization step without repeatedly forcing the same step during the same onboarding version.
- [ ] `bun fmt` passes for the changed packages.
- [ ] `bun lint` passes for the changed packages.
- [ ] `bun typecheck` passes for the changed packages.
