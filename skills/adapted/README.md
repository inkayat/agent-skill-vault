# Adapted skills

Rewritten derivatives of upstream content live **only** in this directory,
never mixed into `skills/upstream/`'s pinned, untouched-upstream references.
Nothing anywhere else in this vault is a rewritten derivative: every other
`firstmate_candidate` or `reference-only` entry either points at
`skills/upstream/<source>/...` (an exact, untouched upstream snapshot,
hash-verified by `tests/local-integrity.test.ts`) or is metadata-only
(`catalog`/`team-only`/`restricted`: no body vendored, no `vault_path`).

## Convention

Every file here opens with an HTML comment stating its provenance and
exactly what changed:

```markdown
<!--
Source: <owner>/<repo>@<40-char-sha>:<path/in/repo/SKILL.md>
Modifications: <summary of what was stripped, rewritten, or added>
-->
```

The corresponding `catalog.yaml` entry's `vault_path` points at
`skills/adapted/<file>`; its `upstream_path` still names the exact upstream
path it was derived from, so provenance stays traceable even though the
content itself now lives here, rewritten.
`tests/adapted-separation.test.ts` enforces the header, cross-checks it
against the entry's own `source`/`upstream_path`, and (network-optional)
verifies the adapted body actually differs from a live fetch of the
unmodified original.

## What's here

- **`mattpocock/code-review/SKILL.md`** -- adapted from
  `mattpocock/skills@c55ee46073ed923f86ce59a5eb3b6d895095d1b7:skills/engineering/code-review/SKILL.md`.
  The original's parallel-subagent fan-out and its
  `docs/agents/issue-tracker.md`/`setup-matt-pocock-skills` spec-bootstrap
  dependency aren't portable to every host this catalog serves. The
  adaptation runs both review axes **sequentially, in one context, in-process
  only** -- no subagent, Task, or background-process primitive of any kind --
  and takes the spec directly from the task brief instead of an issue
  tracker. Everything else -- the fixed-point pinning process, the Fowler
  smell baseline, the two-axis separation rationale -- is unchanged.

Everything else in this vault's `auto-candidate` set passed the five-check
eligibility gate (`bin/lib/catalog.ts`: `FORBIDDEN_MARKERS`, the 24KB size
cap) **unmodified** -- no stripping or rewriting needed. `reference-only`
bodies (pstack `why`/`architect`/`show-me-your-work`, all five Brooks Lint
`brooks-*` skills, Superpowers `brainstorming`/`writing-plans`/
`requesting-code-review`, Addy Osmani's browser-testing/interview/idea-refine
skills, Anthropic `webapp-testing`, Matt Pocock's grilling/domain-modeling/
architecture-review/research skills) are likewise vendored **unmodified**
under `skills/upstream/`, readable by exact id -- they're `reference-only`
because their *workflow* is interactive or tool-dependent, not because the
text itself needed editing. Content that genuinely can't be shipped safely
even as read-only reference (gstack's `gbrain:`/Claude-Code
`allowed-tools`-tagged or `AUTO-GENERATED` bodies) is `catalog`
(metadata-only, never vendored) instead of being force-adapted here.
