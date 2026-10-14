# Dogfooding Session Review & Transcripts (2026-09-13)

Dogfooding review session recorded by Prashant Bhudwal on the `obsidian` branch of Buddy, testing notebook creation, learning flows ("Building an LLM from scratch"), note-taking, and workbench integrations.

---

## Media Files

| Recording | Time (IST) | Duration | Resolution | File Path |
| :--- | :--- | :--- | :--- | :--- |
| **Part 1 (Desktop)** | ~1:45 PM – 2:02 PM | 16m 51s | 2560x1440 | [`/Users/prashantbhudwal/Desktop/Screen Recording 2026-09-13 at 13.45.17.mov`](file:///Users/prashantbhudwal/Desktop/Screen%20Recording%202026-09-13%20at%2013.45.17.mov) |
| **Part 2 (Movies)** | ~2:15 PM – 2:42 PM | 26m 50s | 1920x1080 | [`/Users/prashantbhudwal/Movies/2026-09-13 14-15-29.mkv`](file:///Users/prashantbhudwal/Movies/2026-09-13%2014-15-29.mkv) |

Raw transcript & subtitle exports:
- [`/Users/prashantbhudwal/Desktop/dogfooding_transcripts_2026-09-13/13-45-17_desktop_recording.srt`](file:///Users/prashantbhudwal/Desktop/dogfooding_transcripts_2026-09-13/13-45-17_desktop_recording.srt)
- [`/Users/prashantbhudwal/Desktop/dogfooding_transcripts_2026-09-13/13-45-17_desktop_recording.txt`](file:///Users/prashantbhudwal/Desktop/dogfooding_transcripts_2026-09-13/13-45-17_desktop_recording.txt)
- [`/Users/prashantbhudwal/Desktop/dogfooding_transcripts_2026-09-13/14-15-29_movies_recording.srt`](file:///Users/prashantbhudwal/Desktop/dogfooding_transcripts_2026-09-13/14-15-29_movies_recording.srt)
- [`/Users/prashantbhudwal/Desktop/dogfooding_transcripts_2026-09-13/14-15-29_movies_recording.txt`](file:///Users/prashantbhudwal/Desktop/dogfooding_transcripts_2026-09-13/14-15-29_movies_recording.txt)

---

## Executive Summary of Feedback & UX Issues

### 1. Pedagogical Flow & Prompting ("Quick Check")
- **Overuse of "Quick Check":** Quick Check interrupts the user too frequently (nearly after every basic interaction or short answer).
- **Proactivity vs. Trivial Interrogation:** Instead of checking basic setup questions (*"What machine are you on? What is your Python comfort?"*), the assistant should inspect environment/system context autonomously or act as an executioner.
- **Goal Drift (Execution vs. Learning):** When instructed to help the user learn how to build an LLM, the model ended up just running/training a toy script without explaining what was going on (*"I trained it, but I did not learn anything... the objective here was to learn it"*).
- **Over-indexing on Mermaid Diagrams:** The model generates excessive, overwhelming mermaid diagrams rather than concise, clear conceptual explanations.
- **Concise Response Quality:** Need better prompting patterns for concise explanations. Refer to system prompts from industry leaders (e.g. check the local `agentic` folder and published Anthropic/Claude prompt engineering guidelines).

### 2. Notebook Memory & Long-Term Goals
- **Lack of Goal Persistence:** There is currently no persistent memory or explicit mechanism in the notebook to track long-term learning goals and preferences across chats.
- **Cross-Chat Awareness:** The LLM in a notebook cannot see or search related chats (e.g. OpenCode v2 tools or shared message board / JSONL log of key notebook insights).
- ✅ **Done (`7cb878f2c`) — Chat ID Discovery:** In notebook settings, there is no exposed Chat ID or simple way to identify/reference the current chat.

### 3. Note Mode & Attachment UX
- ✅ **Done (`cd671f9e0`) — Note Mode Exit Trap:** Clicking the Note icon under an assistant response quotes the message and activates Note mode. Dismissing (crossing out) the quoted text does *not* exit Note mode (requires 1 click to enter, but 2 actions to leave).
- **Image Attachments in Notes:** In regular chat, screenshots/images can be attached. In Note mode, the user receives an error: *"Remove attachment before saving this note"*. Images should be natively linkable/attachable to notes.

### 4. Workbench & Tool Output UX
- ✅ **Done (`f04cce49e`) — Open File in Bench vs. Inline:** Clicking *"wrote the file"* opens the file viewer inline inside the chat message rather than offering a direct action to open it in the Bench viewer/reader.
- ✅ **Done (`3b7f1a0b8`) — Tab Alignment in Bench:** Tab titles in the Bench are currently center-aligned, which looks unnatural compared to standard left-aligned editor tabs.
- **Slash Command Disappearance:** Typing `/whiteboard` caused the slash command input to unexpectedly disappear from view.
- ✅ **Done (`8c64232a5`) — Human-Readable Tool Call Titles:** Tool execution labels such as *"searching code"* feel mechanical and non-human; need clearer, natural status descriptions.
- ✅ **Done (`cb9801e29`) — Sidebar Loading Indicator:** Active chat status is shown with a blinking colored dot in the sidebar, which is heavily color-dependent and inaccessible.

---

## Full Timestamped Transcripts

### Part 1: Desktop Recording (`13.45.17.mov`)

```
[00:00.000 --> 00:05.960]  So I'm dogfooding Buddy right now and, you know, this is going to be a long session with long silences and shit.
[00:06.720 --> 00:08.720]  What I am doing this for is for my agent so it can analyze this and, you know, try to figure out the issues that are in...
[00:08.960 --> 00:16.000]  in Buddy right now that I feel while learning.
[00:19.000 --> 00:24.560]  So this is kind of me using my app and recording my thoughts on what is happening, what is going wrong.
[00:25.120 --> 00:28.100]  I'll try to stay into the problem space,
[00:29.100 --> 00:33.740]  but sometimes I might head into the solution space.
[00:35.100 --> 00:37.100]  Yeah.
[00:37.580 --> 00:39.580]  The agent will, you know...
[00:40.940 --> 00:45.500]  coordinate the screenshots and the recording — I mean by screenshots, I mean I'm recording it,
[00:45.500 --> 00:49.300]  so it will have the frames and then basically figure out what I'm talking about
[00:49.820 --> 00:51.820]  and what issues that I'm facing.
[00:53.860 --> 00:55.860]  I'm on the obsidian branch.
[00:56.860 --> 01:01.020]  I'm reviewing this with the note-taking feature that exists right now.
[01:07.020 --> 01:09.020]  Let's create a new book.
[01:09.780 --> 01:12.940]  I'm just gonna create a new book and go from there.
[01:14.220 --> 01:16.220]  I guess I learned...
[01:25.980 --> 01:28.740]  "Building an LLM from scratch".
[01:30.820 --> 01:32.820]  Let's say this is what I want to learn.
[01:33.260 --> 01:35.260]  The notebook is created.
[01:35.660 --> 01:37.660]  All of this appears.
[01:38.020 --> 01:40.020]  The name appears.
[01:41.260 --> 01:44.380]  I'm using Nous 1.3 Spark at extra high.
[01:47.460 --> 01:52.660]  For this purpose I may switch to GPT models also. I'm running the...
[01:53.660 --> 02:00.140]  Buddy dev version built from the build-installable command that is stored on my Mac right now.
[02:10.100 --> 02:14.420]  [Prompting] "Hey Buddy, I need to start building an LLM from scratch
[02:16.900 --> 02:18.580]  basically on my machine.
[02:18.580 --> 02:22.140]  Where do I start? How do I start? I want to understand and learn
[02:22.660 --> 02:24.660]  how to build an LLM."
[02:48.500 --> 02:50.500]  [Feedback] One of the issues that I instantly feel
[02:50.500 --> 02:54.980]  is that this quick check is coming too often, like every time.
[02:55.620 --> 03:00.340]  Like right now I asked this question that you can see on the screen...
[03:04.300 --> 03:10.020]  One thing again I need to figure out is how to get the chat ID from this because right now in notebook settings
[03:10.020 --> 03:12.020]  there is no chat ID.
[03:12.980 --> 03:14.980]  Yeah, that's a problem.
[03:15.460 --> 03:21.060]  So I need to figure out how to get a chat ID from this right now. This is the first chat
[03:21.660 --> 03:24.180]  with the title "Building an LLM from scratch guide".
[03:25.060 --> 03:27.060]  So the problem is this:
[03:32.900 --> 03:40.300]  it gave me one short answer and after that short answer it literally asked me to check:
[03:45.140 --> 03:51.340]  "What's your Python comfort? What machine are you on?"
[03:52.140 --> 03:54.140]  Yeah, so this is an issue.
[03:55.180 --> 04:00.100]  You could have done that on your own.
[04:07.100 --> 04:10.780]  So sometimes when I say these prompts and stuff,
[04:16.460 --> 04:19.820]  this is part of my dogfooding — I am using my voice for prompting.
[04:25.980 --> 04:30.740]  I will actually annotate all my prompts by saying:
[04:37.260 --> 04:41.780]  "Prompting now" or "Hey Buddy".
[05:05.780 --> 05:07.780]  [Prompting] "Prompting now:
[05:18.180 --> 05:25.340]  I don't want to learn Python from scratch.
[05:27.620 --> 05:29.580]  You will be writing Python for me.
[05:29.580 --> 05:34.620]  I just want to understand it at a system level so I can make it with the help of an agent.
[05:34.620 --> 05:37.100]  I do not want to learn Python from scratch.
[05:48.100 --> 05:53.820]  Assume that you are the executioner."
[07:16.340 --> 07:21.340]  [Prompting] "Prompting now: What do you mean by Shakespeare-style generator?"
[07:41.340 --> 07:52.260]  [Feedback] Okay, so this is my dogfooding feedback:
[08:09.900 --> 08:15.060]  There is no way to persist the long-term goal of this notebook at all.
[08:15.780 --> 08:21.300]  There are no instructions that tell Buddy to do that. There are no tools that tell Buddy to do that.
[08:21.300 --> 08:25.180]  There is no skill. There is no memory. The memory system is too convoluted.
[08:27.140 --> 08:32.460]  We need to find out a better system for this so that, you know, the goals of learning or whatever
[08:33.060 --> 08:36.340]  the person is doing in a notebook are very clear.
[08:37.020 --> 08:40.500]  Because without that, this is going to be a shit show.
[08:41.900 --> 08:46.580]  One thing that people are doing is they allow the LLM to look at other chats.
[08:47.020 --> 08:51.860]  Maybe we could do that.
[08:51.860 --> 08:59.300]  I think OpenCode v2 already has a tool for this stuff where the LLM can find other chats and shit.
[09:02.700 --> 09:11.380]  Other than that, the OpenAI/HuggingFace incident also had this thing where
[09:11.900 --> 09:15.900]  agents went to a message board
[09:17.580 --> 09:20.740]  that acted as a continuous memory.
[09:21.980 --> 09:29.580]  Maybe something like that we can do. I don't want it to be opinionated, but what if I just dump a JSONL file
[09:35.900 --> 09:41.140]  of messages and stuff that agents feel is useful in the long term?
[10:00.700 --> 10:04.580]  [Prompting] "Prompting now:
[10:06.540 --> 10:15.420]  Can you maintain a file in this notebook somewhere that tracks my goals and my preferences
[10:16.860 --> 10:18.860]  so we can build over it over time?"
[10:30.300 --> 10:35.540]  [Feedback] While searching things, LLM shows "searching code".
[10:36.540 --> 10:42.900]  We need to find better names for these things. We already have a nice system, but the names are very
[10:43.740 --> 10:49.000]  non-human. This is a simple, complete, atomic task and can be
[10:50.660 --> 10:54.580]  solved very quickly. End of dogfooding feedback for now.
[11:58.300 --> 12:03.540]  [Feedback] Another feedback is that it says "wrote the file", so it wrote a file for me.
[12:07.260 --> 12:15.900]  And when I click "wrote the file", it opens inline — you can see that on the screen at this moment.
[12:17.540 --> 12:25.220]  Clicking open inline is fine, but it should also show some action that allows me to open it in the Bench,
[12:26.100 --> 12:32.500]  because we have a reader for this. I should be able to click this file and open it. I don't know why that is not happening.
[12:34.420 --> 12:39.540]  Maybe we need to find a different way for this.
[12:42.380 --> 12:45.540]  [Prompting] "Prompting now: Can you put this on the Bench, please?"
[13:51.500 --> 13:56.780]  [Prompting] "Now can you tell me where to start learning? Just like where do we start, how do we start?"
[14:03.780 --> 14:05.780]  [Feedback] Another quick feedback:
[14:06.460 --> 14:12.540]  On the left sidebar, while the chat is active, a dot blinks to show the active state.
[14:13.020 --> 14:16.500]  That is color-dependent a lot and is not
[14:17.220 --> 14:23.300]  accessibility-focused at all. That loading state is weird. We need to find a different way / pattern to represent loading state.
[15:43.740 --> 15:47.700]  [Feedback] Another dogfooding feedback:
[15:48.980 --> 15:51.660]  When I click on the Note icon under the assistant response,
[15:51.900 --> 15:57.540]  it shows the message as quoted text and puts me in the note view.
[15:58.180 --> 16:03.180]  On crossing the quoted text, it does not take me out of the note mode — note mode is still active!
[16:03.180 --> 16:06.460]  So I need one click to enter, but two actions to exit.
[16:07.140 --> 16:09.780]  Which is not the optimum way to do things.
[16:21.100 --> 16:25.100]  [Prompting] "Prompting now: Could you please explain things to me?"
[16:38.660 --> 16:43.460]  [Feedback] This small chat mode is not really great for...
```

---

### Part 2: Movies Recording (`14-15-29.mkv`)

```
[00:00.000 --> 00:03.200]  So I am continuing the dogfooding of Buddy.
[00:03.200 --> 00:05.700]  Half the recording is in a different place.
[00:05.700 --> 00:07.700]  This is in a different place.
[01:00.000 --> 01:13.960]  [Feedback] One of the main dogfooding feedbacks is, as you can see here, the thing over-indexes on
[01:13.960 --> 01:15.880]  mermaid diagrams.
[01:15.880 --> 01:20.000]  Over-indexes a lot on mermaid diagrams.
[01:20.000 --> 01:27.000]  We need to fix this shit.
[03:20.000 --> 03:55.960]  [Feedback] Yeah, so we need to find a better way to make concise responses. The current way is not working; it basically fucks the model up.
[03:55.960 --> 04:00.460]  We need to find better ways for concise responses. We need to analyze the
[04:00.460 --> 04:07.160]  agentic folder — there's a folder called "agentic" in the Code folder on this machine.
[04:07.160 --> 04:11.800]  We need to go there, check what different people are using in their prompts.
[04:11.800 --> 04:16.280]  Most of these companies publish prompts also, even Claude publishes their prompts.
[04:16.280 --> 04:23.280]  So yeah, we need to figure it out.
[04:46.280 --> 04:49.780]  [Feedback / Bug] This is weird.
[04:49.780 --> 04:55.680]  I slash-commanded "whiteboard" — check the last few frames here — and the moment I slash-commanded
[04:55.680 --> 04:57.980]  it, the thing just disappeared.
[04:57.980 --> 05:04.140]  I can't see whiteboard command anywhere.
[05:04.140 --> 05:15.840]  Let me go back and, yeah, it just disappears.
[05:15.840 --> 05:26.120]  I don't know where this bug happened, but this happened.
[05:26.120 --> 05:33.120]  This is a new chat called "Building LLM from scratch on local machine".
[05:56.120 --> 06:23.440]  [Feedback] One thing I am just realizing is I should be able to attach images to the notes from here.
[06:23.440 --> 06:30.080]  By that I mean, let's say I want to take a screenshot like this and then I want to
[06:30.080 --> 06:37.120]  push it. So it of course appears right now, but if I go into note mode, what happens then?
[06:37.120 --> 06:44.080]  Oh this is weird: in non-note mode the image appears. Now let's say I'm taking a note:
[06:44.080 --> 06:50.080]  "Remove attachment before saving this note" — that is the message I get!
[06:50.080 --> 06:56.080]  So why can't we, instead of removing attachments, just link attachments to the notes? Why are we not doing this?
[08:50.080 --> 09:13.960]  [Prompting] "But I want to train a GPT, I don't want to train this random bullshit."
[16:13.960 --> 16:25.960]  [Feedback] I trained it, but I did not learn anything, dude! What do you mean I trained it?
[16:25.960 --> 16:32.960]  The objective here was to learn it.
[16:55.960 --> 17:13.640]  [Feedback] This quick check is failing miserably in most of the cases. Like, it's failing miserably.
[17:13.640 --> 17:22.240]  We need to fix the prompting in this.
[17:47.480 --> 17:54.480]  [Prompting] "Can you put up the file you coded on the Bench?"
[18:17.480 --> 18:39.480]  [Feedback] One minor UI-related feedback: the titles of the tabs are center-aligned in the Bench.
[18:39.480 --> 18:41.480]  I don't think that is natural. End of feedback.
[18:59.480 --> 19:04.480]  [Prompting] "Prompting now: Can you help me understand this? What does this mean? I'm not understanding jack shit from this."
[22:09.480 --> 22:18.480]  [Prompting] "Can you show me this code as a diagram somehow?
[22:18.480 --> 22:23.760]  Like at some level of abstraction that I can understand."
[23:48.480 --> 24:17.480]  [Prompting] "What is the meaning of WTE, WPE? What is this shit?"
```
