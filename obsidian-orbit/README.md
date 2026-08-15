# Obsidian → Orbit sync

Write an approval card as a note in Obsidian; n8n renders it and puts it on the
Orbit board. Frontmatter carries the structured fields, the body becomes the
card description, and the card-type rules from the People Ops SOPs are enforced
before anything reaches the board.

**Status: scaffold.** The logic, templates and tests are complete and passing.
Every Orbit API detail in `config.example.json` is a placeholder — nothing here
has been run against the live API. Step 1 below is how you replace the guesses
with facts.

```
Obsidian note ──▶ n8n webhook ──▶ validate ──▶ render ──▶ map fields ──▶ Orbit API
                                     │                                      │
                                     └── report back to Obsidian            └── card id
                                         (what synced, what failed)             stamped
                                                                                back into
                                                                                frontmatter
```

## 1. Confirm the API contract (do this first)

Everything else is already written. This is the only unknown.

Open the board, DevTools → Network, create a card by hand, then find the request
and copy it. Fill in from what you see:

| Question | Where it goes |
| --- | --- |
| Auth — header name, token format, expiry | `api.auth_header`, `api.auth_prefix`, `$env.ORBIT_TOKEN` |
| Create endpoint + method | `api.base_url`, `api.create_path` |
| Update endpoint — PATCH partial or PUT full? | `api.update_path`, `api.update_method` |
| **What the description field accepts** — markdown, HTML, plain text, or rich-text JSON | `description_field`, `description_format` |
| Are board/column ids UUIDs or names? | `board_field`, `column_field`, `column_map` |
| Are headcount/ref first-class fields or a properties bag? | `field_map` |
| Where the card id sits in the response | `response_card_id_path` |

Two answers change the plan rather than a config value:

- **Description is rich-text JSON** (ProseMirror/Tiptap/Slate-style). The
  markdown renderer can't produce that — you'd write a converter for the node
  types Orbit uses. Worth knowing before you invest.
- **There's no HTTP API, only the app's own session-authenticated backend.**
  Then either get a token minted, or fall back to browser automation. Automation
  is fine for the reads you already do in the weekly recap skill; I wouldn't run
  daily writes through it.

Then `cp config.example.json config.json`, edit, and `npm run build`.

## 2. Wire up the trigger

The workflow accepts `{ "notes": [{ "path": "...", "content": "..." }] }` on its
webhook, so any of these work:

- **From inside Obsidian** — `obsidian/send-to-orbit.js` is a Templater user
  script; bind it to a hotkey and it posts the active note, then shows the
  validation result as a Notice. Best ergonomics; only fires when Obsidian is
  open.
- **From git** — Obsidian Git commits and pushes, a GitHub Action posts the
  changed `.md` files to the webhook. Works headless, gives you history. Best if
  you want the sync to happen whether or not the app is running.
- **From the filesystem** — self-hosted n8n with a Local File Trigger watching
  the vault folder, feeding the same Prepare payloads node.

## 3. Import the workflow

Import `n8n/orbit-sync.workflow.json`, then set two environment variables on the
n8n instance:

- `ORBIT_TOKEN` — the Orbit API token
- `OBSIDIAN_TOKEN` — Obsidian Local REST API plugin token, for the write-back

`$env` in expressions needs `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`. If you'd
rather not enable that, swap the two HTTP nodes to a Header Auth credential.

The webhook is unauthenticated as generated. Put n8n behind the VPN or add
Header Auth on the Webhook node before it touches anything real.

## How it behaves

**Validation encodes the SOPs.** A `new_role` note needs title, department,
hiring manager and headcount — and a `salary_range` if the location looks
US-based, because US roles can't post without one. `offer_approval` needs the
candidate's salary expectation and start date, since those get confirmed before
the Head of Department raises the card. `salary_increase` needs the benchmark
rationale Finance asks for. Rules live in `CARD_RULES` in
`lib/build-payload.js`; failures come back as named errors and nothing is sent.

**The sync never rewinds the board.** Orbit stays the system of record for
approvals. The vault may only place cards in `owned_columns` (Preparing case,
HR Review) and may never move a card backwards. Anything past HR Review belongs
to Finance and Rory — a stale note can't undo an approval. Column moves outside
that window return a warning and are dropped.

**It won't duplicate cards.** On first sync n8n writes `orbit_card_id` back into
the note's frontmatter; after that the same note updates rather than creates. A
hash of the payload is stamped alongside it, so a vault-wide commit only pushes
notes that actually changed.

**Notes ship inert.** Templates carry `sync: false`. Nothing reaches the board
until you flip it to `true`.

**Obsidian syntax gets cleaned up.** Wikilinks flatten to their alias, embeds
and Dataview blocks are dropped with a warning, callouts become bold headings,
highlights become bold, comments and block refs disappear, and `#tags` are
pulled out for mapping onto Orbit labels. Code fences pass through untouched.

## Layout

```
config.example.json     copy to config.json — endpoints, field map, columns
templates/              one Obsidian template per card type
obsidian/               Templater script that posts the active note
lib/
  frontmatter.js        dependency-free YAML frontmatter read/write
  normalize-markdown.js Obsidian markdown → markdown / HTML / plain text
  build-payload.js      validation, field mapping, column guard, change hash
n8n/
  build-workflow.js     generates the workflow, inlining lib/ into Code nodes
  orbit-sync.workflow.json   generated — import this
test/                   38 tests
```

n8n Code nodes can't `require` local files, so the library is inlined at build
time. That's why the workflow is generated rather than hand-written: the code
running in n8n is the code the tests cover. **Edit `lib/`, never the generated
JSON** — `npm run check` fails if the committed workflow is stale.

```
npm test      # 38 tests
npm run build # regenerate the workflow
npm run check # both
```

## Known limits

- The frontmatter parser handles scalars and simple lists, not nested maps or
  multi-line strings. Keep templates flat.
- `toHtml` is a small subset — headings, paragraphs, lists, quotes, code, rules,
  and inline bold/italic/code/links. No tables, no nested lists.
- The column guard only gets full rewind protection on updates if the workflow
  fetches the card's current column first. As generated it doesn't; the
  owned-columns check still applies. Add a GET before the update node using
  `api.get_path` if you want it.
- Attachments and image embeds aren't uploaded — they're dropped with a warning.
