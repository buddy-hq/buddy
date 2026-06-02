---
name: find-indian-education-resources
description: Find Indian education work in official sources. Contains NCERT and CBSE textbooks/board practice, 20 state/SCERT textbook routes, NEP/NCF and national guidelines, learning outcomes/NAS/PARAKH/PGI reports, DIKSHA/ePathshala, NROER/NDLI, NIOS/SWAYAM/SWAYAM Prabha/eGyanKosh, and missing-state discovery rules. Use when Indian board, class, curriculum, textbook, government education source, or official learning-resource grounding matters. Do not use for generic pedagogy, generic content creation, or non-Indian education unless the user asks to align with Indian sources.
---

# Official Indian Education Grounding

Use this skill to ground teaching, worksheets, quizzes, explanations, lesson plans, study plans, and assessments in what official Indian education sources actually contain.

Most users will not ask for a source. They will say things like "teach me linear equations", "make a worksheet for grade 8 CBSE", "I study in Tamil Nadu board", "prepare practice questions", "explain this as per NCERT", or "make a lesson plan". In those cases, decide which official source family can ground the answer, read the matching reference, and then produce the educational output the user asked for.

## Workflow
1. find the relevant reference
  2. Infer the learner context: class/standard, board/state, subject, chapter/topic, medium/language, and purpose.Decide whether the user needs concept grounding, textbook sequencing, practice style, assessment alignment, teacher support, policy/curriculum framing, platform content, or an actual resource file. 
  3. Use the mini-router below to choose the most useful reference file.
2. read the reference
3. find the relevant resource to fetch
4a. if downloadable: 
  1. download the relevant resource to users current workspace.
  2. convert the resource into form you can digest.
  3. read the relevant parts
  4. answer the user's question
4b. if webpage/text/ other readable formats
  1. read the resource.
  2. if the resource is too big - put it in a text or markdown file so you can read/grep it
  3. answer the user's question based on the resource
5. Create the requested output normally. Do not turn the answer into a source report unless the user asked for one. 


Caution:

- Do not invent alignment. If the source is unavailable, sale-only, wrapper-only, auth-gated, or inconclusive, say that in the working assumptions or final answer when it matters.
- Always store the downloaded artifacts in current working directory; don't use temp or other system paths by default.

## How Grounding Changes the Answer

Use the references to improve the educational output, not to show off source discovery.

| User task | Ground with | What to adapt in the final answer |
|-----------|-------------|-----------------------------------|
| Teach a concept | Textbook/state source for class/topic; teacher material if needed | Sequence, vocabulary, examples, prerequisite assumptions, and difficulty. |
| Make a worksheet | Textbook/state source plus learning outcomes when useful | Skill target, question progression, mix of recall/application, and board-appropriate wording. |
| Make a quiz/test | Textbook/source plus CBSE board practice or assessment outcomes when relevant | Question types, marks/difficulty, competency style, and answer key/rubric. |
| Make a lesson plan | Textbook/source plus teacher materials or NCF/NCF-FS when relevant | Learning objective, activity flow, examples, assessment check, and age/stage fit. |
| Explain "as per NCERT" | NCERT textbook first; ePathshala/DIKSHA only if platform context appears | Keep content close to NCERT scope and terminology; do not add advanced material unless helpful and labeled. |
| Explain for a state board | State mini-router first | Match the state source, class/standard naming, medium/language, and available textbook/source limits. |
| Support early-grade FLN | NCF-FS and NIPUN Bharat; state source if state-specific | Use foundational literacy/numeracy framing, activity-based approach, and early-grade progression. |
| Create accessible/adapted material | CWSN/eContent guidelines plus source textbook | Adjust format, language, representation, and access needs without changing core learning target. |
| Use online/platform content | DIKSHA/ePathshala, NROER, NIOS/SWAYAM as appropriate | Treat content as platform object/metadata/stream when not a simple PDF; do not force static textbook assumptions. |
| Discuss education data/performance | UDISE/NAS/PGI/PARAKH depending on question | Separate system data, achievement evidence, assessment standards, and performance indices. |

## Common Combinations

- **Grade/class + CBSE + teach/practice**: start with `references/national/textbooks-and-board.md`; add `references/national/assessment-outcomes.md` for outcome-aligned worksheets or diagnostics.
- **Grade/class + CBSE + exam/sample paper**: use `references/national/textbooks-and-board.md`, especially CBSE Academic material.
- **Grade/class + state/medium + teach/practice**: use the relevant state leaf from the State Mini Router; add learning outcomes only if the task needs outcome language.
- **Worksheet/quiz for a chapter**: textbook/state source sets concept scope; learning outcomes can set skill targets; board/sample-paper material can set exam style.
- **Lesson plan for young children**: use `policy-frameworks-guidelines.md` for NCF-FS and `missions-data-schemes.md` for NIPUN Bharat when FLN is relevant.
- **Teacher training or pedagogy support**: use `ncert-publications-teacher-materials.md`; combine with textbook/state source when the task names a class/topic.
- **Digital/QR/app resource**: use `digital-platforms.md`; combine with textbook source only when the content is clearly a digital version of a textbook topic.
- **Open schooling learner**: use `courses-and-media.md` for NIOS rather than NCERT/CBSE, even when the subject sounds similar.
- **Supplementary OER/media**: use `repositories.md` for NROER/NDLI and cite source boundaries; do not replace the main board source unless the user asks for open resources.
- **State source unavailable**: do not silently fall back to NCERT. State the state-source boundary and use NCERT only as a clearly labeled fallback if useful.

## Messy Prompt Examples

| User prompt shape | Likely route |
|-------------------|--------------|
| "I am in grade 8 CBSE, teach rational numbers" | `references/national/textbooks-and-board.md`; optionally learning outcomes for practice design. |
| "Make a worksheet for class 5 EVS, not too hard" | NCERT textbook grounding unless state context is present; learning outcomes if making objectives. |
| "Tamil Nadu class 9 English medium science worksheet" | `references/state/tamil-nadu.md`. |
| "Standard 10 Gujarati medium maths" | Usually `references/state/gujarat.md` unless user says NCERT/CBSE. |
| "I need board style questions for class 10 science" | `references/national/textbooks-and-board.md`, CBSE Academic section if CBSE context. |
| "Make this accessible for a child with disability" | `references/national/policy-frameworks-guidelines.md`, CWSN/eContent sections plus the content source. |
| "Create FLN activities for grade 2" | NCF-FS in `policy-frameworks-guidelines.md` and NIPUN Bharat in `missions-data-schemes.md`. |
| "Use DIKSHA QR content" | `references/national/digital-platforms.md`. |
| "Find official data about schools in this district/state" | `references/national/missions-data-schemes.md`, especially UDISE+. |
| "How did Maharashtra do in learning outcomes?" | `references/national/assessment-outcomes.md`, NAS/PGI depending on phrasing. |
| "NIOS class 10 English material" | `references/courses-and-media.md`, NIOS section. |
| "Use open educational resources for photosynthesis" | `references/repositories.md`, likely NROER. |

## Top-Level Mini Router

Use this by educational intent, not by exact source names.

| User likely needs | Read | Use it to ground |
|-------------------|------|------------------|
| A class/subject textbook basis, chapter sequence, concept scope, examples, or CBSE/NCERT board practice. Typical prompts: "teach grade 8 science", "make class 10 maths worksheet", "CBSE sample paper style", "NCERT chapter practice". | `references/national/textbooks-and-board.md` | NCERT textbook structure, chapter/full-book source patterns, CBSE sample papers, marking schemes, question banks, and board academic materials. |
| State-board or SCERT-aligned teaching/practice. Typical prompts include a state, regional board, state medium/language, "standard" phrasing, or state textbook brand. | See **State Map** below, then read the state leaf. | State-specific official textbook/source boundaries, including direct PDFs, Drive wrappers, ASP.NET portals, WordPress uploads, CDN files, sale-only catalogs, and gaps. |
| Teacher-facing grounding: teacher handbook, source book, guide, ECCE package, NCERT publication, journal article, periodical issue, or professional support material. | `references/national/ncert-publications-teacher-materials.md` | NCERT teacher material, source books, publications, journals, periodicals, and non-textbook support resources. |
| Policy/curriculum/normative grounding: what schools should follow, curriculum framework expectations, digital education guidance, accessibility guidance, screening guidance. | `references/national/policy-frameworks-guidelines.md` | NEP, NCF-SE, NCF-FS, PRAGYATA, eContent guidance, CWSN guidance, and PRASHAST. |
| System-level mission/data grounding: FLN/NIPUN, schemes, implementation documents, public school data, UDISE reports, CIET initiative material. | `references/national/missions-data-schemes.md` | Mission/scheme documents, school data reports, dashboard/document APIs, public initiative PDFs, and restricted-source boundaries. |
| Outcomes/assessment grounding: expected learning outcomes, achievement evidence, state/district performance, report cards, assessment standards. | `references/national/assessment-outcomes.md` | NCERT learning outcomes, NAS reports, PARAKH resources, PGI/PGI-D report cards, and assessment/performance distinctions. |
| Digital platform grounding: QR/DIAL code, content ID, DIKSHA/ePathshala object, app/portal textbook, ECAR collection, online learning resource. | `references/national/digital-platforms.md` | DIKSHA/ePathshala metadata, API routes, platform objects, PDF/EPUB/ECAR distinctions, and auth-gated or metadata-only behavior. |
| Repository/library grounding: OER item, repository video/audio/interactive, NDLI catalog object, source/license lookup. | `references/repositories.md` | NROER/NDLI item discovery, license/source attribution, player or `readDoc` URLs, metadata boundaries, and no-harvesting rules. |
| Open schooling, online-course, broadcast, or open-university grounding: NIOS, SWAYAM, SWAYAM Prabha, eGyanKosh/IGNOU. | `references/courses-and-media.md` | Course-code materials, learner guides, DAISY/EPUB/ZIP assets, course/player metadata, broadcast schedules/streams, handles, and bitstreams. |

## National Source Mini Router

### Textbooks and Board Practice

Read `references/national/textbooks-and-board.md`.

- **NCERT Textbooks**: Official national school textbooks from `ncert.nic.in`. Use for CBSE/NCERT-aligned teaching, chapter scope, textbook sequence, examples, exercises, chapter PDFs, prelims, and full-book ZIPs. This is the usual grounding source when the user says only "grade 8 CBSE", "NCERT class 10 science", "teach this chapter", or "make practice questions" without a state-board context.
- **CBSE Academic**: Board academic material, not the main textbook source. Use for sample papers, marking schemes, question banks, competency practice, board-style practice, and exam-facing alignment. Use this when the user wants exam style, sample-paper style, marking scheme style, or board practice.

### Policies, Frameworks, and Guidelines

Read `references/national/policy-frameworks-guidelines.md`.

- **NEP 2020**: National policy direction. Use when framing broad education-policy intent, not for chapter-level teaching.
- **NCF-SE 2023**: National Curriculum Framework for School Education. Use for curriculum principles, school-stage framing, pedagogy/curriculum expectations, and broader "as per new curriculum framework" tasks.
- **NCF-FS 2022**: Foundational Stage framework. Use for early childhood/foundational learning tasks, ages roughly 3-8, play/activity-based learning, foundational literacy/numeracy, and early-grade pedagogy.
- **PRAGYATA**: Digital education guidelines. Use when the task involves online/blended learning, screen time, remote teaching, or digital lesson design.
- **NCERT eContent guidelines v3.0**: Guidance on creating digital school e-content. Use when making or judging digital learning content, not when fetching ordinary textbook PDFs.
- **CWSN e-content guidelines**: Guidance for e-content for children with disabilities. Use when accessibility, inclusive digital content, special needs, assistive access, or adapted materials matter.
- **PRASHAST**: NCERT disability screening checklist. Use when the task involves screening/checklist resources for disability indicators, not for general teaching.

### Missions, Data, and Schemes

Read `references/national/missions-data-schemes.md`.

- **NIPUN Bharat**: Foundational Literacy and Numeracy mission. Use for FLN, early-grade reading/numeracy, benchmarks, mission documents, and FLN report-library grounding.
- **Samagra Shiksha**: Scheme-level school education documents. Use when the task is about government scheme guidelines, program implementation, school education planning, or scheme PDFs.
- **UDISE+**: School education data system. Use for official school data reports, dashboard artifacts, statistics, public report files, and data-document downloads. It is data/report grounding, not teaching content by itself.
- **CIET initiatives**: NCERT/CIET digital education initiatives and brochures. Use for initiative descriptions, ICT/digital education programs, and public initiative PDFs.

### Assessments, Outcomes, and Performance

Read `references/national/assessment-outcomes.md`.

- **NCERT Learning Outcomes**: Expected learning outcomes by class/subject. Use when making worksheets, quizzes, rubrics, diagnostic checks, remedial practice, or objective-aligned assessments.
- **NAS**: National Achievement Survey. Use for achievement/performance evidence, state report PDFs, and learning-level context across states.
- **PARAKH**: NCERT assessment unit resources. Use for assessment design, standards, assessment frameworks/resources, and competency/assessment grounding.
- **PGI and PGI-D**: Performance Grading Index reports. Use for state/district education system performance and report-card style grounding, not chapter teaching.

### NCERT Publications, Teacher Materials, and Periodicals

Read `references/national/ncert-publications-teacher-materials.md`.

- **NCERT Material for Teachers (DESM)**: Teacher handbooks, source books, subject support books, ECCE packages, and professional-development material. Use when the agent needs teacher-facing explanations, pedagogy support, activities, or source-book grounding beyond the student textbook.
- **NCERT Publications and Print Materials**: Publication/catalog style NCERT material that is not just school textbooks. Use when the user asks for NCERT publications, print materials, catalogs, or non-textbook PDFs.
- **NCERT Journals and Periodicals**: NCERT journal and periodical issues. Use for research-like education articles, issue PDFs, periodical references, and teacher/professional reading.

### Digital Learning Platforms

Read `references/national/digital-platforms.md`.

- **DIKSHA**: National digital education platform. It can contain digital textbooks, ECAR collections, learning resources, QR/DIAL-code linked objects, courses, state hubs, and metadata. Use when the user mentions QR codes, DIAL codes, DIKSHA links, content IDs like `do_...`, online content, platform courses, or app-based resources. DIKSHA is often metadata/platform grounding rather than a simple PDF.
- **ePathshala**: NCERT digital textbook/app platform. Use when the task is about ePathshala versions of NCERT books, topic IDs, app content, EPUB/PDF paths, or NCERT digital textbook access distinct from static `ncert.nic.in` textbook PDFs.

### Repositories and Aggregators

Read `references/repositories.md`.

- **NROER**: National Repository of Open Educational Resources. Use for OER items such as PDFs, videos, audio, images, interactives, license-aware reuse, and item/player URLs. It is useful when the agent wants supplementary open resources, not only textbook grounding.
- **NDLI**: National Digital Library of India. Use for catalog/library metadata, publisher/source resolution, and item discovery. Do not treat it as a bulk download source; often it is metadata or access-boundary grounding.

### Courses, Media, and Open University

Read `references/courses-and-media.md`.

- **NIOS public materials**: National Institute of Open Schooling public course materials. Use for secondary/senior secondary/vocational/open basic education learners, course codes, learner guides, syllabus PDFs, EPUB/ZIP/DAISY accessible packs, and open schooling alignment.
- **SWAYAM**: MOOC/course platform. Use for online course metadata, course pages, preview/player assets, and higher or self-paced learning contexts.
- **SWAYAM Prabha**: Educational TV/channel/streaming source. Use for channel schedules, telecast rows, streams, and broadcast-based learning plans.
- **eGyanKosh**: IGNOU/open university repository. Use for open university units, IGNOU course material, handles, item pages, and bitstream PDFs.

## State Mini Router

Use this map directly when the user gives a state, state-board context, regional medium, or state textbook brand. Read the state file before grounding state-specific teaching or practice.

| State / cue | Read | Use when |
|-------------|------|----------|
| Andhra Pradesh, AP SCERT | `references/state/andhra-pradesh.md` | Use for AP SCERT or Andhra Pradesh state-board grounding. The reference is mainly an official-source boundary: the portal may time out or be inconclusive, so it prevents the agent from inventing AP textbook URLs or substituting unofficial mirrors. |
| Assam, Assam SCERT | `references/state/assam.md` | Use for Assam state textbooks and SCERT materials. It covers official SCERT pages, on-domain PDFs, and official Drive-wrapped textbook links, so it is useful when grounding Assam-specific class/subject/medium material. |
| Bihar, Bihar SCERT, Bihar e-resources | `references/state/bihar.md` | Use for Bihar SCERT e-resources, textbooks, teacher handbooks, and PDF detail pages. The file explains Bihar's opaque upload filenames, so the agent must identify the resource from the detail page rather than filename guesses. |
| Chhattisgarh, CG SCERT | `references/state/chhattisgarh.md` | Use for Chhattisgarh SCERT textbooks by class, subject, year, and medium. It is useful for state textbook grounding where English/Hindi medium and reduced-PDF base paths matter. |
| Goa, Goa SCERT | `references/state/goa.md` | Use for Goa SCERT textbooks, life-skills/value-education booklets, curriculum reports, and official WordPress PDFs. It also explains when Goa textbook links become official Drive wrappers instead of direct PDFs. |
| Gujarat, GSSTB, GCERT | `references/state/gujarat.md` | Use for Gujarat textbooks by standard, medium, and subject. It covers the GSSTB folder API and `ViewFile` wrapper, so the agent understands that listing records must be resolved through the official wrapper flow. |
| Haryana, Haryana SCERT, Saksham | `references/state/haryana.md` | Use for Haryana SCERT material, Saksham textbooks, and Haryana public education PDFs. It covers both direct S3/CDN PDFs and official Drive-wrapper textbook rows where some files download and others remain wrapper-only. |
| Jammu and Kashmir, J&K, JKBOSE | `references/state/jammu-kashmir.md` | Use for JKBOSE/J&K board textbooks and official NIC-hosted paths. It is useful when grounding class/subject teaching in J&K board material while handling official-site timeout or source-gap behavior. |
| Karnataka, KTBS, Karnataka Textbook Society | `references/state/karnataka.md` | Use for Karnataka textbooks by class, medium, subject, or language. The reference emphasizes matching listing anchor text before filenames and avoiding invented `uploads/*.pdf` paths. |
| Kerala, SCERT Kerala | `references/state/kerala.md` | Use for Kerala standard-wise textbook grounding. It covers encoded direct archive PDF names, subject/part distinctions, and cases where directory listings fail even though direct PDF URLs work. |
| Madhya Pradesh, MP, Vimarsh | `references/state/madhya-pradesh.md` | Use for MP Vimarsh/state education materials. It helps distinguish real textbooks from rationalization lists, Urdu ZIP archives, vocational listing pages, and inconclusive ASP.NET/session cases. |
| Maharashtra, Balbharati, eBalbharati | `references/state/maharashtra.md` | Use for Maharashtra/Balbharati textbooks by class, medium, and subject. It covers eBalbharati portal filters, ASP.NET postback behavior, and numeric `pdfs/{id}.pdf` downloads. |
| Nagaland, SCERT Nagaland | `references/state/nagaland.md` | Use for Nagaland syllabi, ECCE curriculum handbooks, preschool teacher manuals, and transition syllabus resources. It is more useful for syllabus/teacher-handbook grounding than for broad secondary textbook coverage. |
| Odisha, OSEPA, SCERT Odisha | `references/state/odisha.md` | Use for Odisha textbooks, workbooks, OCF/ULLAS material, scanned PDFs, and SCERT publication uploads. It helps the agent verify WordPress upload PDFs and handle scanned/large PDFs honestly. |
| Punjab, Punjab Educare | `references/state/punjab.md` | Use for Punjab Educare e-books, textbooks, worksheets, and Drive-wrapped resources. It explains how official Google Sites listings lead to Drive files and how to distinguish successful Drive export from wrapper-only access. |
| Rajasthan, RBSE, BSER | `references/state/rajasthan.md` | Use for Rajasthan board textbooks and session-year books pages. It covers frameset navigation, relative PDF paths, current-year listings, and the fact that commented links can still be live after verification. |
| Tamil Nadu, TN SCERT, ADT | `references/state/tamil-nadu.md` | Use for Tamil Nadu textbooks by class, subject, and medium. It explains the ADT browser picker, official CloudFront file exposure, SCERT captcha boundary, and when static curl only gives a JS shell. |
| Telangana, TS SCERT | `references/state/telangana.md` | Use for Telangana SCERT e-textbooks. It covers `ebooks2019` filename patterns and warns that some bad guesses return 200 HTML traps rather than PDFs. |
| Uttar Pradesh, UP SCERT | `references/state/uttar-pradesh.md` | Use for Uttar Pradesh SCERT e-books by class/subject. It emphasizes hub row labels, encoded filenames, and listing identity before download. |
| West Bengal, WBBSE | `references/state/west-bengal.md` | Use for West Bengal/WBBSE book grounding. The official site exposes catalog/sale-counter behavior and may not provide free on-domain textbook PDFs, so the correct outcome can be sale-only/listing-only rather than fetched material. |

## Missing State Coverage

If the user names a state/UT or state-board source that is not in the State Mini Router, the agent can still ground the work using its own web search and web fetch tools.

Use the existing state files as pattern examples:

- Look for official domains first: SCERT, state textbook board, state education department, NIC/government domains, or official state education portals.
- Search by messy user intent, not just source names: `{state} SCERT textbooks`, `{state} board class {class} {subject} PDF`, `{state} e textbook`, `{state} education department textbook`, `{state} medium textbook`.
- Prefer official source pages and listings over direct guessed PDFs. The pattern across state references is: discover from an official listing, identify class/subject/medium from visible labels, then verify any file bytes or wrapper boundary.
- Expect varied hosting patterns: direct PDFs, WordPress uploads, ASP.NET postbacks, Drive wrappers, CDN files, JS-only portals, sale-only catalogs, and timeout-prone government hosts.
- If no official source can be verified, state the boundary clearly and, if useful, use NCERT/CBSE as a labeled fallback rather than pretending it is the state source.
- When a new state source is found, follow the same reference discipline: official domain, what the source covers, discovery path, fetch/access boundary, verification checks, disambiguation traps, and honest status.

Do not use random PDF mirrors, coaching sites, Scribd-style uploads, school reuploads, or file names guessed from another state’s pattern unless the user explicitly approves degraded mode.

## Ambiguity Handling

- When the user says only "grade 8 CBSE" or similar, start from NCERT/CBSE grounding and optionally learning outcomes if making assessments or worksheets.
- When the user gives a state or state board context, use the state map before national NCERT.
- When the user asks to teach or make a worksheet, read the relevant textbook/source reference to ground scope and examples; do not return a source catalog unless useful.
- When the user asks to make an assessment, combine the textbook/source reference with learning outcomes or board assessment material when relevant.
- When a request sounds like a textbook but mentions QR, app, content ID, online platform, or interactive object, treat it as digital platform grounding before static textbook URLs.
- When a request sounds like a report, decide whether it is about learning/assessment performance (`assessment-outcomes.md`) or a mission/scheme/data system (`missions-data-schemes.md`).
- When a source gives only a catalog, Drive wrapper, sale counter, login wall, stream URL, or metadata record, report that honestly instead of forcing a PDF.

## What to Look For Inside References

References are meant to be loaded only when relevant. Most source sections include:

- **What this source offers**: the resource types actually available.
- **URL and link patterns**: official domains, stable paths, APIs, wrappers, and known traps.
- **How to fetch / Workflow / Discovery**: the shortest route from user request to official URL.
- **Verify**: PDF/ZIP/EPUB/stream/listing checks.
- **Disambiguation / known gaps**: similar sources that should not be substituted.
- **fetch_status**: how to honestly classify blocked, gated, moved, sale-only, wrapper-only, or missing resources.

## If the User Explicitly Wants a Resource

When the user asks for a file, link, source list, or verification, fetch or classify the resource directly. Include enough traceability to be useful: title, official source URL or landing page, whether a local file was downloaded, format, and any access boundary (`wrapper_only`, `auth_required`, `sale_only`, `source_gap`, `inconclusive`, etc.).

## Guardrails

- Do not use third-party mirrors unless official discovery fails and the user explicitly approves degraded mode.
- Do not bulk-harvest NDLI or other aggregators.
- Do not silently substitute a different board, medium, language, class, subject, year, or platform. Report the honest status instead.
