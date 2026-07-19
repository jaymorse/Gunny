# AI Enablement Plan for a Technical Program Manager (Oracle)

**Goal:** Make AI a daily operating layer for a TPM — so reports, status roll-ups, and repetitive data work happen in minutes instead of hours, with the TPM spending their time on judgment, escalation, and cross-team decisions instead of copy-paste.

**Audience:** A TPM at Oracle running multiple programs across engineering, product, and stakeholder teams.

**Scope:** This plan assumes an AI assistant (Claude) with connectors to the tools a TPM lives in — mail, calendar, docs/drive, chat, and meeting transcription — plus document-generation skills for spreadsheets, slides, and Word/PDF. Where Oracle mandates specific tooling (Outlook/Teams/OCI, Oracle internal AI, corporate DLP rules), the *workflows* below transfer directly; only the connector names change.

---

## 1. Guiding principles

1. **Automate the assembly, own the judgment.** AI drafts the status report, pulls the metrics, and summarizes the meeting. The TPM decides what's red, what to escalate, and what to say to a VP.
2. **Single source of truth in, formatted artifacts out.** Keep program data in one place (a tracker sheet, a Drive folder, a project channel). Point AI at it; let it generate the weekly deck, the exec email, the RAID log — never re-key data by hand.
3. **Templatize once, reuse forever.** A TPM's outputs are highly repetitive (weekly status, launch readiness, risk reviews). Build a prompt/skill for each recurring artifact so every week is a 30-second refresh, not a rewrite.
4. **Verify before you send.** AI-drafted numbers and commitments get a human check. Treat AI output as a strong first draft from a fast analyst, not as signed-off truth.
5. **Respect data handling.** Confirm what program/customer data is allowed into which AI system per Oracle policy before wiring up connectors. When in doubt, work from redacted or synthetic inputs.

---

## 2. The daily & weekly operating rhythm

| Cadence | Workflow | AI does | TPM does |
|---|---|---|---|
| **Every morning (10 min)** | Daily brief | Summarize overnight mail, today's meetings, blocked items, and Slack/Teams mentions into one briefing | Triage: pick the 3 things that matter, decide escalations |
| **Before each meeting** | Meeting prep | Pull attendee context, last decisions, open action items on that program | Walk in knowing the state without digging |
| **After each meeting** | Notes → actions | Transcribe, summarize decisions, extract owners + due dates, draft follow-up | Confirm owners, send |
| **Daily (as work lands)** | Inbox/chat drafting | Draft replies, status nudges, cross-team asks | Edit tone, approve |
| **Weekly (Thu/Fri)** | Status report roll-up | Assemble program status from tracker + notes + metrics into the standard report/deck | Set RAG status, add narrative, escalate |
| **Weekly** | Risk / RAID review | Diff this week's risks vs last, flag new/aging items | Decide mitigations |
| **Monthly / on milestone** | Exec update & metrics | Build the exec summary, trend charts, launch-readiness scorecard | Deliver the story |

The rest of this plan details each workflow, the tool to use, and how to use it.

---

## 3. Workflow playbook (with exact usage)

### 3.1 The morning brief
**What it replaces:** 20–30 min of scanning mail, calendar, and chat to reconstruct "what's going on."

**Tools:** Mail connector (Gmail/Outlook) + Calendar + Slack/Teams search.

**How to use it — daily prompt:**
> "Give me my morning brief. Summarize unread mail from the last 16 hours grouped by program, list today's meetings with what each is about, surface any message where someone is waiting on me or flagged a blocker, and give me a prioritized top-5 action list."

**Level up:** Set this to run automatically each weekday morning so the brief is waiting for you (a scheduled/recurring task). Then you start the day reacting to a summary, not an inbox.

---

### 3.2 Meeting prep
**What it replaces:** Digging through old notes before a call.

**Tools:** Calendar (next event) + Drive/Docs search + mail history.

**How to use it:**
> "My next meeting is [program X sync]. Pull the last decisions and open action items for that program, who owns what, and anything unresolved from the previous session. Give me a half-page prep sheet."

---

### 3.3 Meeting notes → decisions → action items
**What it replaces:** Manual note-taking and the "who agreed to what" reconstruction afterward.

**Tools:** A meeting-transcription connector (e.g., Fireflies) or transcript file → AI summarization.

**How to use it:**
1. Let the transcription tool capture the call.
2. Prompt:
   > "From this meeting transcript, give me: (1) a 5-bullet summary, (2) every decision made, (3) an action-item table with owner and due date, (4) any risks or dependencies raised. Then draft a follow-up email to attendees."
3. Confirm owners/dates, paste the action items into your tracker, send the follow-up.

**Result:** The single biggest time sink for a TPM — turning meetings into tracked commitments — collapses to a review-and-send.

---

### 3.4 Inbox & chat drafting
**What it replaces:** Writing the same status nudges, cross-team asks, and "circling back" notes all day.

**Tools:** Mail + Slack/Teams connectors.

**How to use it:**
- "Draft a reply to this thread confirming the launch date slips to [date] and explaining the dependency, professional but not defensive."
- "Draft a Slack message to #program-x asking each workstream lead for their RAG status and top risk by EOD Thursday."
- "Summarize this 40-message thread into: the decision, who's blocked, and what I need to do."

Keep drafts in your voice by saving a short style note ("concise, direct, no filler, lead with the ask") the assistant reuses.

---

### 3.5 The weekly status report — the flagship workflow
**What it replaces:** The 1–2 hours every week spent assembling status from many sources into the standard format.

**Tools:** Program tracker (spreadsheet) + meeting notes + metrics → document/slide skill.

**How to use it:**
1. **Keep one tracker** (a sheet in Drive) with per-workstream: status, milestone dates, % complete, risks, blockers. This is the input of record.
2. **Weekly prompt:**
   > "Using the program tracker at [link] and this week's meeting notes, generate our standard weekly status report: overall RAG, per-workstream status with the delta since last week, milestones hit/missed, top 3 risks, and asks for leadership. Match the format of last week's report."
3. AI produces the draft (as a Word doc, Google Doc, or slides).
4. **You** set/override RAG colors, add the narrative and the "so what," and mark escalations.

**Make it a template:** After the format stabilizes, capture it as a reusable skill/prompt so week N is: "run the weekly status" → review → send.

---

### 3.6 Risk / RAID log maintenance
**What it replaces:** Manually reconciling what changed in the risk register.

**How to use it:**
> "Compare this week's risk register to last week's. What's new, what aged without movement, what closed? Flag any risk open >2 weeks with no mitigation owner, and suggest a mitigation for each new one."

The TPM decides which risks to escalate; AI does the diffing and the nagging.

---

### 3.7 Data & metrics work
**What it replaces:** Cleaning exports, building the same charts, computing rollups by hand.

**Tools:** Spreadsheet skill (xlsx) + data-visualization skill + Wolfram for any real math.

**How to use it:**
- **Clean/reshape:** "This CSV export is messy — dedupe, fix the date columns, and pivot defects by team and severity."
- **Roll up:** "From this Jira/defect export, give me open vs. closed by week, average age of open blockers, and which team is trending worse."
- **Visualize:** "Build a burn-down and a defect-trend chart I can drop into the exec deck," using the dataviz skill for clean, consistent visuals.
- **Sanity-check math:** Use Wolfram for capacity/date/rate calculations so numbers in reports are right.

Always spot-check AI-computed figures against the raw source before they go in a report.

---

### 3.8 Executive summaries & decks
**What it replaces:** Translating detailed program state into a VP-ready one-pager or deck.

**Tools:** Slide skill (pptx) + doc skill (docx/pdf) + internal-comms styling.

**How to use it:**
> "Turn this weekly status into a 5-slide exec update: one-line program health, milestone timeline, top 3 risks with mitigations, key decision needed, and the ask. Executive tone — outcomes not activity."

Then refine the story; AI handles the layout and first-pass wording.

---

### 3.9 Cross-program search & recall
**What it replaces:** "Where did we decide that?" archaeology across docs and chat.

**How to use it:**
> "Search my Drive and Slack for the decision on the [auth migration] rollback plan and tell me what we agreed and who owned it."

---

## 4. Rollout plan — crawl, walk, run

**Week 1 — Crawl (prove value on low-risk work)**
- Connect mail, calendar, and drive/docs (within Oracle data policy).
- Adopt two workflows only: the **morning brief** and **meeting notes → action items**.
- Goal: feel the time savings on the two highest-frequency tasks.

**Weeks 2–3 — Walk (attack the flagship)**
- Consolidate program data into one tracker.
- Build the **weekly status report** workflow and run it for a real cycle.
- Add **inbox/chat drafting** and **meeting prep** to the daily habit.

**Week 4 — Run (templatize & automate)**
- Turn the weekly status, exec update, and RAID diff into saved templates/skills so they're one-command refreshes.
- Schedule the morning brief to run automatically each weekday.
- Add **metrics/dataviz** for the recurring charts.

**Ongoing — Compound**
- Each time you do a repetitive task twice, template it.
- Maintain a personal "prompt library" of the exact prompts that work for your programs.

---

## 5. Metrics — is this working?

Track for 4 weeks before/after:
- **Hours/week on reporting & status assembly** (target: down 50–70%).
- **Meeting → action-items latency** (target: same day, every time).
- **Status report on-time rate** (target: 100%, because it's now a 30-min task).
- **Escalation lead time** — risks surfaced earlier because the diffing is automated.
- **Subjective:** time spent on judgment/coordination vs. copy-paste (the real win).

---

## 6. Guardrails & data handling

- **Confirm Oracle policy** on what program, customer, and financial data may enter each AI/connector before wiring it up. Prefer approved/internal AI systems for anything sensitive.
- **Human-in-the-loop on anything outbound** — every AI-drafted email, exec number, and commitment gets a human review before it leaves.
- **No unverified numbers in reports.** AI assembles; the TPM verifies against source.
- **Least-privilege connectors.** Grant only the access each workflow needs.
- **Keep an audit trail.** Reports and decisions still live in the system of record, not in a chat thread.

---

## 7. Quick-start checklist

- [ ] Confirm which AI tools/connectors are approved under Oracle data policy.
- [ ] Connect mail, calendar, drive, and chat.
- [ ] Set up meeting transcription for recurring syncs.
- [ ] Create the single program tracker (system of record).
- [ ] Start the **morning brief** habit (then automate it).
- [ ] Adopt **meeting notes → action items** for every meeting.
- [ ] Build and run the **weekly status report** workflow.
- [ ] Save a personal prompt library and templatize the top 3 recurring reports.
- [ ] Review metrics at week 4; expand to metrics/dataviz and exec decks.
