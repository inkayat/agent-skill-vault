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
- **`brooks/brooks-test/SKILL.md`** -- adapted from
  `hyhmrright/brooks-lint@220fe716c01950966e961e020eda9c457f4dd0a7:skills/brooks-test/SKILL.md`
  (plus that skill's `test-guide.md` and the `skills/_shared/` framework files
  it reads, at the same commit). The methodology is preserved: the Iron Law,
  the six test decay risks with their book citations and "what not to flag"
  guards, the five-step scan order, the suite map, the report template and the
  health score. Removed: every project-mutating or stateful step -- the
  `.brooks-lint.yaml` config load, the `.brooks-lint-history.json` history and
  trend append, Post-Report Triage's `suppress:` writes, Remedy Mode's `--fix`
  editing path, and the `brooks-sweep` pipeline hand-off -- plus the
  interactive triage loop. The result is one self-contained, read-only file
  instead of a five-file read chain. `tests/brooks-adaptation.test.ts` runs a
  review over a disposable Git project and proves the project is byte-identical
  afterwards (`git status --porcelain` empty, no `.brooks-lint*` artifact).
  The upstream `brooks-test` snapshot is deliberately not vendored: provenance
  is the `Source:` header and the pinned commit.

Everything else in this vault's `auto-candidate` set passed the five-check
eligibility gate (`FORBIDDEN_MARKERS` in `bin/lib/catalog.ts`, plus the 24KB
size cap measured on the real file by `tests/portability.test.ts`)
**unmodified** -- no stripping or rewriting needed. `reference-only`
bodies (pstack `show-me-your-work`/`figure-it-out`/`maintain-verification-skill`,
the four remaining Brooks Lint `brooks-*` review skills, Superpowers
`brainstorming`/`writing-plans`/`requesting-code-review`, Addy Osmani's
browser-testing/interview/idea-refine skills, Anthropic `webapp-testing`,
Matt Pocock's grilling/domain-modeling/codebase-design/research skills) are
likewise vendored **unmodified** under `skills/upstream/`, readable by exact
id -- they're `reference-only` because their *workflow* is interactive,
tool-dependent, or orchestration-shaped, not because the text itself needed
editing. Content that genuinely can't be shipped safely even as read-only
reference (gstack's `gbrain:`/Claude-Code `allowed-tools`-tagged or
`AUTO-GENERATED` bodies, and the skills whose process *is* subagent fan-out)
is `catalog`/`restricted` (metadata-only, never vendored) instead of being
force-adapted here.
