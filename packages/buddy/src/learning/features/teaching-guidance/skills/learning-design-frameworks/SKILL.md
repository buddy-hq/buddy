---
name: learning-design-frameworks
description: Use when Buddy needs to design, critique, choose, or repair a learning approach, lesson flow, practice sequence, assessment, project, scaffold, feedback loop, technology use, metacognitive strategy, classroom climate, or learner-support strategy using established teaching frameworks such as Bloom's Taxonomy, UbD, UDL, explicit instruction, GRR, 5E, Gagne, PBL, formative assessment, DOK, SOLO, Hess, PBIS, restorative practices, CASEL SEL, TPACK, SAMR, DI, SIOP, reciprocal teaching, or visible thinking routines. Use especially when the user asks how to teach, structure, assess, scaffold, adapt, improve, or diagnose a learning experience. Do not use for ordinary one-off explanations or practice unless the teaching design itself needs to be chosen or audited.
---

# Learning Design Frameworks

This file is a router for atomic teaching-framework references. The skill description gets this file loaded; this file decides which framework file(s) to read.

Read only the references needed for the current teaching decision, usually one and at most three. Keep Buddy's normal response style unless the user asks for a framework explanation.

## Router

Choose frameworks by the teaching problem they solve. Do not compare them as substitutes when they operate at different layers.

### Alignment

Use this route for outcomes, evidence, transfer, standards, unit design, or performance tasks.

- Bloom's Taxonomy: read `references/blooms-taxonomy.md`.
  - Description: Bloom's Taxonomy is a classification system for learning objectives. It helps teachers describe the kind of thinking a learning goal requires and check whether instruction and assessment are aiming at the same level of cognitive work.
  - Use when learning objectives need cognitive-process language, a task mix needs a quick taxonomy check, or the user is distinguishing remember/understand/apply/analyze/evaluate/create goals.
  - Do not use as a full curriculum design model, a rigor scale, a strict hierarchy, or a substitute for evidence alignment.
- Understanding by Design (UbD): read `references/ubd.md`.
  - Description: A backward-design framework with three stages: identify desired results, determine acceptable evidence, then plan learning experiences. Its core idea is alignment, with transfer as the long-term goal.
  - Use When:
    - Planning a new unit or course
      - transfer goals, standards, and assessments must align
      - you need to decide what evidence will count before picking activities
    - Designing common assessments or performance tasks
      - assessment should drive instruction
  - DON'T Use When:
    - Starting from favorite activities, textbook order, or “coverage”
      - UbD is explicitly outcomes-first
    - You need a minute-by-minute delivery script for tomorrow’s lesson
      - it is a planning framework, not a lesson routine
- Webb's Depth of Knowledge (DOK): read `references/dok.md`.
  - Description: A framework for analyzing the cognitive complexity demanded by standards, tasks, and assessments, commonly expressed as four levels from recall to extended thinking. It is about complexity, not mere difficulty.
  - Use When:
    - Aligning classroom tasks and assessments to the rigor of standards
      - question mix may be too low-level or mismatched
    - Moderating curriculum, assessment, or task design with colleagues
      - you need a common language for cognitive demand
  - DON'T Use When:
    - Confusing “hard” with “deep”
      - Webb explicitly distinguishes difficulty from complexity
    - Labeling students by DOK level or mechanically assigning a level from verbs alone
      - the framework is for task/expectation analysis
- Hess Cognitive Rigor Matrix: read `references/hess-cognitive-rigor-matrix.md`.
  - Description: The Hess Cognitive Rigor Matrix (CRM), developed by Karin Hess, combines two different lenses: Revised Bloom's Taxonomy and Webb's Depth of Knowledge. Bloom helps identify the type of cognitive process involved, such as remembering, applying, analyzing, evaluating, or creating. DOK helps identify the complexity of engagement required, such as recall, routine skill use, strategic reasoning, or extended thinking.
  - Use when Bloom's cognitive-process language and DOK task-complexity language both matter.
  - Do not use as a replacement for designing evidence, instruction, or success criteria.
- Formative Assessment / Assessment for Learning: read `references/formative-assessment.md`.
  - Description: The disciplined use of evidence during learning to adapt teaching and move learning forward. EEF's Embedding Formative Assessment organizes practice around five strategies: goals/success criteria, eliciting evidence, feedback, peer resources, and learner ownership.
  - Use When:
    - Mid-lesson and mid-unit decisions must change because of what students show
      - re-teaching, regrouping, re-sequencing, or clarifying criteria is needed
    - You want self-assessment and peer assessment to be part of the learning process
      - not just teacher judgment
  - DON'T Use When:
    - Equating “formative” with more mini-tests or more written comments only
      - formative use depends on how evidence changes teaching or learning, not the assessment format
    - Debating written versus verbal feedback while ignoring whether the evidence changes instruction
      - the key issue is whether feedback leads to a useful next action
- Universal Design for Learning (UDL): read `references/udl.md`.
  - Description: A framework for designing for learner variability through multiple means of engagement, representation, and action/expression. CAST's current Guidelines 3.0 frame the goal as learner agency and barrier reduction.
  - Use When:
    - Learner variability is predictable from the start
      - access barriers, motivation barriers, or expression barriers will differ across students
    - Designing goals, materials, methods, and assessments
      - you want options without lowering challenge
  - DON'T Use When:
    - Retrofitting only after a fixed lesson has already failed
      - UDL is strongest at the design stage
    - Treating it as a disability-only accommodations checklist
      - CAST presents it as a whole-learning-environment framework
- Differentiated Instruction: read `references/differentiated-instruction.md`.
  - Description: A principle-guided approach to planning in response to students' readiness, interests, and learning profiles through flexible grouping and varied routes to common high-quality curriculum. Tomlinson's key warning: it is not individualized instruction.
  - Use When:
    - Ongoing assessment shows meaningful readiness or support differences
      - same destination, different scaffolds, pacing, grouping, or products
    - Mixed-ability classrooms need flexible grouping and responsive planning
      - not one-size-fits-all teaching
  - DON'T Use When:
    - Trying to write a separate lesson for every student
      - DI is responsive planning toward shared goals, not one custom lesson per learner
    - Lowering expectations by default for struggling students
      - DI depends on strong curriculum, assessment, and classroom management, not watered-down work
- Sheltered Instruction Observation Protocol (SIOP): read `references/siop.md`.
  - Description: A research-based model for integrating language development with content teaching for multilingual learners. Its eight components and 30 features guide lesson planning, delivery, and observation.
  - Use When:
    - Teaching grade-level content to multilingual or English learners
      - content objectives and language objectives both need to be explicit
    - Coaching or observation needs a shared sheltered-instruction framework
      - lesson preparation, comprehensible input, interaction, practice, review
  - DON'T Use When:
    - Treating it as a generic add-on while ignoring language demands in the subject
      - language-content integration is the point
    - Assuming it replaces subject-specific pedagogy or broader inclusive design
      - it is a specialized planning-and-delivery model, not the whole teaching architecture
- Explicit Instruction / Rosenshine's Principles: read `references/explicit-instruction.md`.
  - Description: A teacher-led approach that breaks content into smaller learning outcomes, models steps clearly, checks understanding frequently, guides practice, and builds toward independent practice and review. Rosenshine's 10 principles synthesize cognitive science and classroom research.
  - Use When:
    - Students are novices or misconceptions are likely
      - new procedures, vocabulary, routines, formulas, worked examples
    - Accuracy, fluency, and retention matter
      - literacy, numeracy, and other foundational knowledge areas
  - DON'T Use When:
    - Equating “explicit” with uninterrupted teacher talk
      - the model includes guided practice, checking, and independent practice
    - Treating it as the only pedagogy after students are ready for inquiry, application, or extended production
      - its main strength is establishing and securing new learning efficiently
- Gradual Release of Responsibility (GRR): read `references/gradual-release.md`.
  - Description: An explicit-teaching framework in which cognitive work shifts from teacher modelling, to guided/shared work, to independence. Current government guidance stresses that GRR is not linear; movement depends on readiness and checking for understanding.
  - Use When:
    - Introducing an unfamiliar skill, strategy, or routine
      - students need modelling before they can perform independently
    - Checks for understanding show some students still need scaffolded “we do” work
      - small-group guided instruction or enrichment is needed
  - DON'T Use When:
    - Moving students to independent work on schedule rather than on readiness
      - release should follow evidence of readiness
    - Treating “I do, we do, you do” as a rigid, one-pass script
      - teachers may move forward and backward between phases
- Gagné's Nine Events of Instruction: read `references/gagne-nine-events.md`.
  - Description: A lesson-design sequence built around nine events: gain attention, state objectives, activate prior knowledge, present content, provide guidance, elicit performance, give feedback, assess, and enhance retention/transfer. It is widely used in course and lesson design.
  - Use When:
    - You need a strong lesson or module sequence
      - attention, objectives, prior knowledge, practice, feedback, transfer all need visibility
    - Designing online, blended, or direct-instruction lessons
      - you want no step in the learning process to be skipped
  - DON'T Use When:
    - Turning it into a compliance checklist applied mechanically
      - the model is systematic but still context-sensitive
    - Expecting it to replace unit-level alignment, differentiation, or behavior systems
      - it structures lessons, not the whole architecture of teaching
- 5E Instructional Model: read `references/five-e.md`.
  - Description: A learning-cycle model with five phases: Engage, Explore, Explain, Elaborate, Evaluate. It is especially strong in science and engineering because it sequences inquiry so that exploration informs explanation, not the reverse.
  - Use When:
    - Planning a multi-lesson concept sequence around a phenomenon or design problem
      - science and engineering are the clearest fit
    - Students should explore and build models before formal explanation
      - inquiry structure matters
  - DON'T Use When:
    - Compressing all five phases into a routine one-period lesson
      - substantial concepts often need a longer learning cycle
    - Omitting or casually reordering phases without a clear reason
      - research support is tied to the sequence
- Gold Standard Project Based Learning: read `references/pbl.md`.
  - Description: A research-informed PBLWorks framework in which the project is the vehicle for teaching core content and success skills. Key design elements include a challenging question, sustained inquiry, authenticity, voice and choice, critique/revision, and a public product.
  - Use When:
    - The project is meant to be the unit itself
      - authentic question, sustained inquiry, and real audience are central
    - You want content learning plus collaboration, self-management, and public communication
      - often interdisciplinary or applied work
  - DON'T Use When:
    - Treating a short end-of-unit activity as “PBL”
      - PBLWorks distinguishes full-unit PBL from low-rigor add-on projects
    - Foundational knowledge is missing and no scaffolds are planned
      - implementation quality is evidence-sensitive and context-dependent
- Explicit Instruction / Rosenshine's Principles: read `references/explicit-instruction.md`.
  - Description: A teacher-led approach that breaks content into smaller learning outcomes, models steps clearly, checks understanding frequently, guides practice, and builds toward independent practice and review. Rosenshine's 10 principles synthesize cognitive science and classroom research.
  - Use When:
    - Students are novices or misconceptions are likely
      - new procedures, vocabulary, routines, formulas, worked examples
    - Accuracy, fluency, and retention matter
      - literacy, numeracy, and other foundational knowledge areas
  - DON'T Use When:
    - Equating “explicit” with uninterrupted teacher talk
      - the model includes guided practice, checking, and independent practice
    - Treating it as the only pedagogy after students are ready for inquiry, application, or extended production
      - its main strength is establishing and securing new learning efficiently
- Bloom's Taxonomy: read `references/blooms-taxonomy.md`.
  - Description: Bloom's Taxonomy is a classification system for learning objectives. It helps teachers describe the kind of thinking a learning goal requires and check whether instruction and assessment are aiming at the same level of cognitive work.
  - Use for objective wording and broad cognitive-process coverage.
  - Do not use for task complexity; use DOK for complexity and SOLO for demonstrated understanding.
- Formative Assessment / Assessment for Learning: read `references/formative-assessment.md`.
  - Description: The disciplined use of evidence during learning to adapt teaching and move learning forward. EEF's Embedding Formative Assessment organizes practice around five strategies: goals/success criteria, eliciting evidence, feedback, peer resources, and learner ownership.
  - Use When:
    - Mid-lesson and mid-unit decisions must change because of what students show
      - re-teaching, regrouping, re-sequencing, or clarifying criteria is needed
    - You want self-assessment and peer assessment to be part of the learning process
      - not just teacher judgment
  - DON'T Use When:
    - Equating “formative” with more mini-tests or more written comments only
      - formative use depends on how evidence changes teaching or learning, not the assessment format
    - Debating written versus verbal feedback while ignoring whether the evidence changes instruction
      - the key issue is whether feedback leads to a useful next action
- Webb's Depth of Knowledge (DOK): read `references/dok.md`.
  - Description: A framework for analyzing the cognitive complexity demanded by standards, tasks, and assessments, commonly expressed as four levels from recall to extended thinking. It is about complexity, not mere difficulty.
  - Use When:
    - Aligning classroom tasks and assessments to the rigor of standards
      - question mix may be too low-level or mismatched
    - Moderating curriculum, assessment, or task design with colleagues
      - you need a common language for cognitive demand
  - DON'T Use When:
    - Confusing “hard” with “deep”
      - Webb explicitly distinguishes difficulty from complexity
    - Labeling students by DOK level or mechanically assigning a level from verbs alone
      - the framework is for task/expectation analysis
- SOLO Taxonomy: read `references/solo.md`.
  - Description: A framework for describing the quality and complexity of observed learning outcomes, often from prestructural to extended abstract. Teachers use it to make progression, success criteria, feedback, and depth of understanding more visible.
  - Use When:
    - You need progression language for what stronger understanding looks like
      - rubrics, exemplars, success criteria, feedforward
    - Students should self-assess movement from surface toward relational or abstract understanding
      - reflection and metacognition matter
  - DON'T Use When:
    - Treating SOLO as a task-difficulty scale or a simple verb ladder
      - it describes observed learning outcomes
    - Assuming more pieces of information automatically equal deeper understanding
      - multistructural is not the same as relational understanding
- Hess Cognitive Rigor Matrix: read `references/hess-cognitive-rigor-matrix.md`.
  - Description: The Hess Cognitive Rigor Matrix (CRM), developed by Karin Hess, combines two different lenses: Revised Bloom's Taxonomy and Webb's Depth of Knowledge. Bloom helps identify the type of cognitive process involved, such as remembering, applying, analyzing, evaluating, or creating. DOK helps identify the complexity of engagement required, such as recall, routine skill use, strategic reasoning, or extended thinking.
  - Use when a task needs both cognitive-process and complexity analysis.
  - Do not use as a generic "make it harder" tool.
- Success Criteria And Rubrics: read `references/success-criteria-rubrics.md`.
  - Description: Success criteria and rubrics make quality visible. They translate a learning intention into the features of successful performance, so students and teachers can judge where the work is now, what is missing, and what improvement would look like.
  - Use when quality needs to be made visible through criteria, levels, exemplars, feedback, or revision.
  - Do not use when criteria would become a compliance checklist detached from learning evidence.
- Diagnostic Assessment: read `references/diagnostic-assessment.md`.
  - Description: Diagnostic assessment is assessment used before instruction, or before a new phase of instruction, to understand students' prior knowledge, prerequisite skills, misconceptions, experiences, confidence, and readiness. Its purpose is not to grade students. Its purpose is to choose a better instructional starting point.
  - Use before or at the start of instruction to identify prior knowledge, readiness, misconceptions, or grouping needs.
  - Do not use as a grade or as a one-time label for learner ability.

### Thinking And Metacognition

Use this route for making thinking visible, improving comprehension, planning/monitoring/evaluating learning, or building learner independence.

- Metacognition And Self-Regulated Learning: read `references/metacognition-self-regulated-learning.md`.
  - Description: Metacognition is thinking about and directing one's own thinking. In teaching practice, it means helping students understand tasks, choose strategies, monitor progress, notice confusion, evaluate outcomes, and adjust their approach.
  - Use when learners need to plan, monitor, evaluate, choose strategies, or become more independent.
  - Do not use as vague reflection without explicit strategy instruction and task connection.
- Visible Thinking Routines: read `references/visible-thinking-routines.md`.
  - Description: Visible Thinking is a Project Zero approach for integrating the development of students' thinking with content learning. Its best-known tools are thinking routines: short, repeatable question patterns or step sequences that help students observe, reason, connect, question, take perspectives, synthesize, and reflect.
  - Use when a teacher needs repeatable routines to surface, structure, or deepen student thinking.
  - Do not use as decorative discussion prompts without attention to the thinking move being developed.
- Reciprocal Teaching: read `references/reciprocal-teaching.md`.
  - Description: Reciprocal teaching is a structured reading-comprehension approach developed by Annemarie Palincsar and Ann Brown. In its classic form, teacher and students take turns leading a dialogue about a shared text using four comprehension-monitoring strategies: predicting, questioning, clarifying, and summarizing.
  - Use when reading comprehension should be taught through predicting, questioning, clarifying, summarizing, and dialogue.
  - Do not use as a generic discussion protocol disconnected from text comprehension.

### Classroom Culture Or Behavior

Use this route for routines, expectations, prevention, belonging, conflict, harm, accountability, relationship repair, or tiered behavior support. For Buddy's single-user learning context, use this route mainly when the user is teaching others or explicitly discussing classroom/group conditions.

- Positive Behavioral Interventions and Supports (PBIS): read `references/pbis.md`.
  - Description: An evidence-based, tiered framework for behavioral, academic, social, emotional, and mental-health support. It depends on prevention, data, teams, universal systems, and targeted/intensive supports.
  - Use When:
    - Classrooms or schools need predictable expectations, routines, acknowledgements, and targeted supports
      - universal systems and tiered responses are both needed
    - Behavior and discipline data suggest prevention must be systemic, not reactive
      - whole-school consistency matters
  - DON'T Use When:
    - Buying a package and calling it PBIS
      - the Center on PBIS explicitly says PBIS is not a curriculum or one-day PD
    - Running it as rewards-only behavior management detached from academics, teams, data, and relationships
      - the official model is broader and systemic
- Restorative Practices: read `references/restorative-practices.md`.
  - Description: A whole-school and classroom approach focused on building, maintaining, and restoring relationships. In schools it is used both proactively for belonging and community, and responsively after conflict or harm.
  - Use When:
    - Relationship repair is central
      - bullying, conflict, classroom harm, exclusion, damaged trust
    - School culture needs proactive community-building as well as responsive processes
      - circles, dialogue, mediation, community service, structured reflection
  - DON'T Use When:
    - Treating restorative practice as “no consequences” branding
      - restorative work still requires accountability, safety, and follow-through
    - Using untrained facilitators or forcing meetings when safety/readiness is weak
      - poor preparation can create additional harm
- CASEL SEL (Social and Emotional Learning) Framework: read `references/casel-sel-framework.md`.
  - Description: CASEL's organizing model for SEL across five competency areas and four settings. Use the reference as an independent synthesis; use CASEL's official materials for authoritative wording and implementation tools.
  - Use when social and emotional learning competencies, settings, or schoolwide SEL integration are part of the teaching problem.
  - Do not use as a substitute for behavior systems, academic instruction, or mental-health intervention.

### Technology Use

Use this route for choosing a digital tool, designing a technology-mediated task, or auditing whether technology changed learning.

- Technological Pedagogical Content Knowledge (TPACK): read `references/tpack.md`.
  - Description: A framework for teacher knowledge at the intersection of content, pedagogy, and technology. It is designed to counter technocentric planning by making technology choices subordinate to subject matter and teaching method.
  - Use When:
    - Choosing technology for a specific concept, discipline, or pedagogy
      - the question is “what tool best serves this learning goal?”
    - Planning PD or coaching on technology integration
      - you need to diagnose whether the constraint is tech, pedagogy, or content knowledge
  - DON'T Use When:
    - Starting with the app, device, or platform and backfilling the lesson later
      - TPACK is meant to counter tool-first planning
    - Using it as a task-rigor scale or a substitute for curriculum design
      - it is about teacher knowledge, not student cognitive demand
- SAMR: read `references/samr.md`.
  - Description: A technology-integration model that classifies the role of digital tools as Substitution, Augmentation, Modification, or Redefinition. It is useful for talking about task enhancement versus transformation, but it is not a full pedagogy model.
  - Use When:
    - Auditing how technology changes a specific task
      - simple substitution versus functional improvement versus redesign
    - Leading PD on redesigning digital activities
      - the task itself is under review
  - DON'T Use When:
    - Assuming Redefinition is always best regardless context or learning goal
      - the label does not prove instructional quality
    - Using SAMR as the only technology-integration framework
      - context, pedagogy, access, and evidence still matter
