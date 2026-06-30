# adhd-focus skill

Seven ADHD-friendly executive-function coaching techniques, packaged as an installable
Claude Skill. Adapted from a social-media prompt carousel ("TAF") that framed them as a
fictional "ADHD Executive Function Mode" — there is no such built-in Claude feature;
these are prompts, now turned into a real Skill.

The seven techniques: Task Paralysis Shatterer, Dopamine Menu Architect, Body Doubling
Simulator, Context-Switching Guide, Interest-Based Filter, Time-Blindness Auditor, and
Executive Function Externalizer.

## Install

### Claude Code
This skill lives at `.claude/skills/adhd-focus/` and is picked up automatically for
anyone working in this repo. To use it everywhere (not just this project), copy the
folder to your user-level skills directory:

```bash
mkdir -p ~/.claude/skills
cp -r .claude/skills/adhd-focus ~/.claude/skills/
```

Then invoke it by asking naturally ("help me, I can't start this task") or with
`/adhd-focus` if exposed as a command.

### claude.ai (web / desktop)
1. Zip the skill folder:
   ```bash
   cd .claude/skills && zip -r adhd-focus.zip adhd-focus
   ```
2. In claude.ai go to **Settings → Capabilities → Skills**.
3. Upload `adhd-focus.zip`.

Skills require the relevant capability to be enabled on your plan; if you don't see the
Skills section, the feature isn't available on your account yet.

## How it works
Claude reads `SKILL.md`, matches your situation to one of the seven techniques, and runs
it as a short coaching interaction. See `SKILL.md` for the selection table and details.
