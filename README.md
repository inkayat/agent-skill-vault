# agent-skill-vault

A private, curated, provenance-pinned index of specialist skills FirstMate can
name **by path** in a task brief. `firstmate-config` pins/caches one exact
revision of this repo and exports its root -- it does not clone any upstream
repo. So every skill a worker can actually be handed lives inside this repo:
either an untouched upstream snapshot or an explicitly rewritten derivative.

## The boundary (read this first)

- **Nothing here is ever globally registered.** No entry is symlinked into
  `~/.agents/skills`, listed in any OMP `skills.customDirectories`/
  `includeSkills`, or otherwise loaded into every session's context. Every
  pick is named explicitly, by path, in one task's brief.
- **`auto-candidate` never means automatic loading.** It means a body is
  *eligible* for a deliberate, per-task, human-in-the-loop-or-Captain choice
  from a category shortlist (`bin/lookup.ts --category ...`). Nothing reads
  itself into context on its own.
- **Zero specialist skills is a valid outcome for a task.** `bin/lookup.ts`
  returns the full, deterministic shortlist for a category (not an
  artificially truncated slice); picking none from it is always correct when
  nothing fits, and the final selection is capped at the existing
  shared-skill budget (≤2 methodology + ≤1 reference) by the caller, not by
  this repo. See "Looking something up" below.
- **Project-local skills always win.** If the target repo already has a
  relevant skill under its own `.agents/skills/` (or equivalent), use that
  instead of a vault pick. That precedence, and the final ≤3-row selection,
  are `firstmate-config` policy decisions made outside this repo -- this
  repo's lookup only returns the complete set of real candidates; it never
  pretends to perform that selection itself.
- **Every vendored byte is inventoried.** `catalog.yaml`'s `vendored` list has
  one row per file under `skills/` -- skill bodies, prompts, references,
  `_shared` framework files, scripts, and licenses -- with its source, its
  upstream path, and its `sha256`. Nothing under `skills/` may exist without a
  row, and no entry may point outside it.
- **`reference-only` rows carry a real local body too, but only for
  explicit-id/captain reference -- never category/auto selection.**
  `catalog`, `team-only`, and `restricted` rows never appear in lookup, even
  by exact id. `bin/lookup.ts` only ever surfaces `installed`,
  `firstmate_candidate`, and `reference-only` rows
  (`ALLOWED_LOOKUP_STATUSES` in `bin/lib/catalog.ts`); of those,
  `lookupByCategory` narrows further to `firstmate_candidate` rows with
  `activation=auto-candidate` only.
- **No Team Mode, no automatic merge, no daemon.** `team-only` rows are a
  parking lot for orchestration-shaped material with no active behavior;
  nothing here starts, stops, or merges anything.

## Content model

`firstmate_candidate` **and** `reference-only` entries both resolve to a
**real local file** in this repo, recorded as `vault_path`, in one of two
places:

- **`skills/upstream/<source-id>/<upstream_path>`** -- an untouched snapshot,
  byte-identical to the pinned commit, kept at the same relative path it has
  upstream (so a body's own `../_shared/...` or `references/...` pointers
  resolve locally). The `vendored` inventory records its hash;
  `tests/local-integrity.test.ts` verifies both that the local file matches
  that hash and (network-optional) that it's still byte-identical to the live
  commit it claims to be pinned at.
- **`skills/adapted/<...>`** -- a rewritten derivative. The file itself opens
  with a `Source:`/`Modifications:` header naming exactly what upstream
  commit/path it came from and what changed. See `skills/adapted/README.md`.

The two statuses differ only in *how* they may be picked:
`firstmate_candidate` is eligible for an `auto-candidate` category shortlist
or an `explicit` task-named pick; `reference-only` is **never** picked by
category or automatically -- it exists so the Captain (or a worker, for the
few `worker`-scope rows) can look one up **by exact id** and read a real,
offline-available body, without the vault ever suggesting it.

`installed` rows (already globally pinned via `firstmate-config`'s
`external.lock`) have no `vault_path`; they resolve through
`~/.agents/skills/<installed_as>` instead, so the catalog stays the complete
map without a second registration path.

`catalog` and `team-only`/`restricted` rows are **metadata-only**: no
`vault_path`, no vendored body, never resolvable by any lookup, not even by
exact id. `catalog` is used for two distinct reasons, both recorded in the
entry's `notes`: **unclear or derived-unreviewed rights** (e.g. Vercel's
`web-design-guidelines`, `ciembor/agent-rules-books`), or **content
deliberately not shipped** because it's generated/host-bound/too expensive
to be worth a local copy (e.g. gstack's `gbrain:`-tagged, Claude-Code
`allowed-tools`-tagged, or `AUTO-GENERATED` bodies). `upstream_path` is kept
on these rows where it maps to one real upstream file, for provenance --
it's just never fetched.

## Files

| File | What it is |
| --- | --- |
| `catalog.yaml` | **Hand-maintained, and the only authority.** Three parts: `sources` (one entry per upstream repo/plugin, with license/provenance), `entries` (one row per skill/book/item), and `vendored` (one row per maintained file under `skills/`, with its source, upstream path and expected `sha256`). Nothing in this repo is generated. |
| `skills/upstream/` | Untouched upstream snapshots, one subtree per source, at each source's real relative paths (including each source's own `LICENSE`). |
| `skills/adapted/` | Rewritten derivatives, each header-tagged with its source and modifications. |
| `bin/lib/catalog.ts` | Schema, validation, and lookup/render logic shared by every consumer. |
| `bin/lookup.ts` | The read-only lookup CLI (below). |
| `tests/` | `bun test` -- schema and inventory invariants, provenance (incl. the split pstack/Thermos licenses), exact paths, safe status/activation combinations, vendored-content integrity against the inventory (hard-fail on a missing file or hash mismatch; network-optional pin-staleness check where a reachable 404 is a failure, not a skip), dependency closure of vendored bodies, orchestration safety of the whole selectable surface, the Brooks adaptation's read-only behavior on a disposable Git project, auto-candidate size limits, explicit-id and category lookup behavior, no-aggregator-mirroring, and unmodified-vs-adapted separation (with a real content-diff check, not a tautology). |

## Vocabulary

- `status`: `installed` (already globally pinned via `firstmate-config`'s
  `external.lock`; this row exists so the catalog stays the *complete* map,
  not a second registration path) | `firstmate_candidate` (a real local
  `vault_path`; eligible for a worker brief pick, by category or by name) |
  `reference-only` (**also** a real local `vault_path`; readable only by
  exact id or Captain reference, never by category/auto selection) |
  `catalog` (metadata only -- no body ever fetched, either because the
  license is unclear/derived-unreviewed, or because the content is
  generated/host-bound/too expensive to be worth shipping) | `team-only`
  (orchestration/multi-agent material with no FirstMate Team Mode to run it
  yet) | `restricted` (lifecycle-owning, host-bound, or otherwise unsafe to
  import as active behavior).
- `activation`: `auto-candidate` (eligible for the Captain's per-task pick
  from a category shortlist) | `explicit` (only when the task text names the
  need) | `never` (every non-`firstmate_candidate` row).
  Invariant: `status != firstmate_candidate ⇒ activation == never`; tested in
  `tests/schema.test.ts` and `tests/safety.test.ts`.
- `candidate` (`status = firstmate_candidate ∧ activation = auto-candidate`)
  is **derived**, never stored (`bin/lib/catalog.ts`: `isCandidate`), and is
  the last column of every lookup row.
- `scope`: `worker` | `captain` | `worker+captain`. Captain-scope rows are
  read by the human/Captain only when explicitly asked for that mode
  (planning, interrogation, retros), never during routine task dispatch.
- `categories`: an optional, multi-valued **hint**, not a rule. No
  category→skill table exists in policy; nothing loads because a category
  matched.
- `cluster`: a cheap policy hint that groups items covering the same problem
  space (e.g. every root-cause-debugging treatment across five upstreams is
  `cluster: debugging`) so the reasoning behind picking one over another
  stays attached to the data. It ranks nothing and selects nothing.
- `upstream_path`: where this entry was read from in its source repo
  (provenance only).
- `vault_path`: the real local file a worker/Captain actually reads. Non-null
  for `firstmate_candidate` and `reference-only` rows only, and always a row
  in `vendored` -- an entry can never point at a file the inventory does not
  maintain.
- `vendored[].sha256`: the one recorded hash for that file. Entries carry no
  hash of their own, and no test hardcodes a commit: the inventory is the
  single pin authority (`tests/provenance.test.ts` enforces that).

## Looking something up

```console
$ bun bin/lookup.ts --id pstack:blast-radius
pstack:blast-radius	firstmate_candidate	auto-candidate	worker	REVIEW,DEEP	review	skills/upstream/cursor-plugins-pstack/pstack/skills/blast-radius/SKILL.md	true	Prove the one safety fact by running code. Note: skip the arena step.

$ bun bin/lookup.ts --category REVIEW
pstack:blast-radius	firstmate_candidate	auto-candidate	worker	REVIEW,DEEP	review	skills/upstream/cursor-plugins-pstack/pstack/skills/blast-radius/SKILL.md	true
pstack:principle-encode-lessons-in-structure	firstmate_candidate	auto-candidate	worker	REVIEW,IMPLEMENT	meta	skills/upstream/cursor-plugins-pstack/pstack/skills/principle-encode-lessons-in-structure/SKILL.md	true
pstack:principle-test-behavior-not-implementation	firstmate_candidate	auto-candidate	worker	IMPLEMENT,REVIEW	tdd	skills/upstream/cursor-plugins-pstack/pstack/skills/principle-test-behavior-not-implementation/SKILL.md	true
pstack:principle-type-system-discipline	firstmate_candidate	auto-candidate	worker	IMPLEMENT,ARCHITECTURE,REVIEW	architecture	skills/upstream/cursor-plugins-pstack/pstack/skills/principle-type-system-discipline/SKILL.md	true
pstack:typescript-best-practices	firstmate_candidate	auto-candidate	worker	IMPLEMENT,REVIEW	architecture	skills/upstream/cursor-plugins-pstack/pstack/skills/typescript-best-practices/SKILL.md	true
pstack:unslop	firstmate_candidate	auto-candidate	worker	RESEARCH,REVIEW,ARCHITECTURE,TENTH-MAN	docs	skills/upstream/cursor-plugins-pstack/pstack/skills/unslop/SKILL.md	true

$ bun bin/lookup.ts --id brooks:brooks-test
brooks:brooks-test	firstmate_candidate	explicit	worker		tdd	skills/adapted/brooks/brooks-test/SKILL.md	false	Explicit test-quality specialist, served by the FirstMate-safe adaptation at skills/adapted/brooks/brooks-test/SKILL.md: [...]

$ bun bin/lookup.ts --id pstack:how
no row for id pstack:how (unknown id, or a catalog/team-only/restricted row -- those are never looked up)

$ bun bin/lookup.ts --id books:a-philosophy-of-software-design
no row for id books:a-philosophy-of-software-design (unknown id, or a catalog/team-only/restricted row -- those are never looked up)
```

`--category` returns the **full** deterministic shortlist -- every real
`auto-candidate` match, sorted by id, never truncated to a fixed row count.
Deciding which (if any) to actually put in a brief, honoring the existing
≤2-methodology+≤1-reference budget, and letting a project-local skill win
over a vault pick, is a `firstmate-config` policy decision made by the
caller with the full shortlist in hand -- not something this lookup fakes
by hiding real candidates behind an arbitrary cap.

The `cache_path`/`vault_path` column (7th) is a path relative to this repo's
own root, exactly as `firstmate-config` exports it. An `installed` row's
cache path is `~/.agents/skills/<name>` instead, since it's already loaded
globally by name.

`--id` output carries a 9th, final column: the row's `notes` field
(`bin/lib/catalog.ts`: `renderIdRow`), backslash-escaped by `escapeTsvField`
so an embedded tab, newline, or backslash in the note can never introduce an
extra column or row -- deterministic and always exactly one line. A row with
no caveat still ends in a tab (empty final field), never an omitted column.
`--category` output stays the unchanged 8-column shape (`renderRow`, no
notes) so an ordinary category consultation never pays for a column it
doesn't need.

### Handoff format (for whoever names a pick in a brief)

Path + a one-line read-and-apply requirement + the row's `notes` column
(the adaptation/usage caveat, if any) verbatim from the `--id` output's 9th
field -- never re-derive it by reading `catalog.yaml` by hand: `notes` is
each entry's last YAML key, often more than ten lines below `- id:`, and a
short grep window over the file misses it. Never paste the skill body into
a brief.

## Provenance and license approach

Every entry in `catalog.yaml`'s `sources:` map records `license`,
`license_evidence` (a URL pinned at the exact commit), `origin`
(`canonical`/`mirror`), and `rights` (`clear` / `derived-unreviewed` /
`unclear`). Sources with `rights: unclear` are always `pinned: false`:
nothing is ever vendored or read from them -- see `vercel-labs-agent-skills`
(no license file anywhere in the repo) and the two discovery aggregators
below.

`cursor/plugins` is one monorepo with **two separate LICENSE files** for the
two plugins vaulted from it: `pstack/LICENSE` (MIT © Lauren Tan) and
`thermos/LICENSE` (MIT © Cursor). They are recorded as two distinct sources,
`cursor-plugins-pstack` and `cursor-plugins-thermos` -- same repo and commit,
distinct `license_evidence` -- so one plugin's license evidence never stands
in for the other's (`tests/provenance.test.ts` enforces this).

`ciembor/agent-rules-books` (all 14 rule sets) is `rights: derived-unreviewed`:
the MIT grant to us is clear, but the author's own README/`docs/CRITICISM.md`
acknowledges the books' rule summaries are ChatGPT-distilled from
copyrighted texts with upstream legal review "about 3/10 solved." Per the
captain's unclear-provenance rule, these are `status: catalog`, metadata-only
-- never copied locally, `upstream_path` retained for provenance only, the
caveat recorded in each entry's `notes`.

`skills.sh` (`vercel-labs/skills`) and Agentic Awesome Skills
(`sickn33/agentic-awesome-skills`) are **discovery metadata only** -- their
`sources` entries are `pinned: false`, their catalog rows are `status:
catalog`, and `tests/no-mirroring.test.ts` enforces that nothing in this
vault mirrors either aggregator's content wholesale.

Every source with at least one vendored (`skills/upstream/`) entry has its
own `LICENSE`/`LICENSE.txt` vendored alongside the content
(`tests/local-integrity.test.ts` enforces this). Anthropic's `frontend-design`
carries a per-skill `LICENSE.txt` (Apache-2.0) rather than a repo-level
license, and that's exactly what's vendored.

## Pin bump procedure

1. Edit the source's `sha` (and, if relevant, `license`/`rights`) in
   `catalog.yaml`.
2. Re-fetch every `vendored:` row whose `source` is that source, at the new
   commit and the row's own `upstream_path`, and update each row's `sha256`.
   The inventory is the complete list -- skills, prompts, references, helper
   and `_shared` framework files, scripts, and licenses -- so nothing is
   missed by walking entries alone.
3. Re-check the adaptations derived from that source (`skills/adapted/...`,
   `upstream_path: null`): their `Source:` header names the old commit.
4. `bun test`
5. Commit `catalog.yaml` and the updated `skills/` files together.

A pin bump that introduces an orchestration primitive or a host-binding
marker into any selectable body (or a support file it reads) fails
`tests/selectable-safety.test.ts`; one that breaks a vendored body's
references fails `tests/dependency-closure.test.ts`; one whose new content
doesn't match the recorded `sha256` fails `tests/local-integrity.test.ts`.
All three are local and deterministic. If the live commit no longer serves a
recorded path, the network-optional half of the integrity test fails loudly
instead of skipping, because a reachable 404 is a broken pin, not an offline
environment.

## Considered, not adopted

The full reasoning lives in `catalog.yaml`'s `notes` fields (one per entry);
this is a summary of what was deliberately excluded and why, so the research
behind each exclusion is not silently redone on a future pass:

- **Orchestration/lifecycle** (`restricted`/`team-only`): pstack
  `poteto-mode`/`arena`/`swarm`/`interrogate`/`reflect`/`how`/`architect`/
  `why`; Thermos's `thermos` orchestrator and both subagent wrappers;
  gstack's `cso`/`benchmark`/`qa-only`/`careful`/`freeze`/`guard`; Brooks
  Lint's `brooks-sweep`; Superpowers' `using-superpowers`/`writing-skills`/
  `using-git-worktrees`/`finishing-a-development-branch`/
  `dispatching-parallel-agents`/`subagent-driven-development`/
  `executing-plans`; Addy Osmani's `doubt-driven-development`; Matt Pocock's
  `wayfinder`/`to-spec`/`to-tickets`. FirstMate owns task lifecycle,
  worktrees, branches, and merges; these either spawn subagents via a
  host-specific primitive, shell out to an external model CLI, intercept every
  tool call via a host-specific hook API, or bootstrap a tracker FirstMate
  doesn't use.
- **Host-generated, deliberately not shipped** (`catalog`, metadata-only):
  all 8 named gstack reference items (`office-hours`/`plan-ceo-review`/
  `plan-eng-review`/`retro`/`spec`/`document-release`/`review`/`investigate`)
  carry `gbrain:` context-query blocks, Claude-Code `allowed-tools` schemas,
  or are `AUTO-GENERATED from SKILL.md.tmpl` -- none is a safe local
  reference as written, so none is vendored; `upstream_path` is kept for
  provenance.
- **Unclear/derived-unreviewed license** (`catalog`, metadata-only): all 14
  `ciembor/agent-rules-books` rule sets (see Provenance above); Vercel
  `web-design-guidelines`/`vercel-labs/agent-skills` (no license file
  anywhere in the repo).
- **Vendored as `reference-only`** (real local body, explicit-id/captain
  reference only, never category/auto): pstack `show-me-your-work`/
  `figure-it-out`/`maintain-verification-skill`/
  `principle-guard-the-context-window`; the four Brooks Lint `brooks-*`
  review skills (`review`/`audit`/`debt`/`health`) with their complete
  `_shared`/guide dependency chain (clear MIT license; cost no longer
  disqualifies once a body is explicit-id-only rather than auto-loaded);
  Superpowers' `brainstorming`/`writing-plans`/`requesting-code-review`; Addy
  Osmani's `browser-testing-with-devtools`/`interview-me`/`idea-refine`;
  Anthropic `webapp-testing`; Matt Pocock's `grilling`/`domain-modeling`/
  `codebase-design`/`improve-codebase-architecture`/`research`. Each is
  interactive, MCP/tool-dependent for its *workflow*, or orchestration-shaped
  enough that an unattended worker should not run it -- but the text itself is
  safe, clear-license, and worth having offline to read by exact id.
- **Duplicative of an installed skill** (`explicit`, not `auto-candidate`):
  pstack's `principle-prove-it-works`/`principle-fix-root-causes`/
  `principle-minimize-reader-load`; Addy Osmani's `code-simplification`/
  `debugging-and-error-recovery`. Each restates an already-installed skill
  (`verification-before-completion`, `systematic-debugging`, `ponytail`) at a
  different scale -- kept as `explicit` complements, not folded in, not
  promoted to `auto-candidate`. `principle-subtract-before-you-add` was
  **removed** in the post-merge hardening pass: unlike `minimize-reader-load`
  (two measurable axes: layers to trace, state to hold) it is a straight
  restatement of Ponytail with nothing of its own.
- **Adapted instead of vendored unmodified**: Matt Pocock's `code-review`
  (parallel-subagent fan-out plus an issue-tracker/`setup-matt-pocock-skills`
  bootstrap dependency) and Brooks Lint's `brooks-test` (project config load,
  history-file append, suppression writes, interactive triage, `--fix` path).
  Both are real rewritten derivatives under `skills/adapted/`, sequential and
  read-only, rather than unmodified `skills/upstream/` snapshots. See
  `skills/adapted/README.md`.

## Post-merge hardening pass

The curated surface was re-audited body-by-body after the initial merge. What
changed, all recorded per-entry in `catalog.yaml`'s `notes`:

- **Reclassified as `restricted`** (metadata-only, local body removed) because
  the skill's *process* is subagent fan-out, an external model CLI, or an
  unvendorable prompt chain: `pstack:how`, `pstack:architect`, `pstack:why`,
  `addy:doubt-driven-development` (shells out to `codex exec`/`gemini`),
  `superpowers:writing-skills` (host-bound paths, subagent pressure tests).
- **Demoted to `reference-only`** (body kept, never category/auto selection):
  `pstack:figure-it-out` (per-worker worktrees), `pstack:maintain-verification-skill`
  (one subagent per feature file), `pstack:principle-guard-the-context-window`
  (routes bulk output to subagents), `mattpocock:codebase-design` (parallel
  sub-agents per candidate design).
- **Demoted to `explicit`**: `thermos:thermo-nuclear-review`, retained as a
  high-risk specialist a task names deliberately rather than an ordinary
  shortlist row. `thermos:thermo-nuclear-code-quality-review` stays explicit
  and is never stacked with Ponytail in one brief.
- **Promoted to `explicit` via adaptation**: `brooks:brooks-test`, now served
  by `skills/adapted/brooks/brooks-test/SKILL.md`.
- **Removed entirely**: `mattpocock:grill-me`/`grill-with-docs` (two-line router
  stubs that only aliased `mattpocock:grilling`, the real skill),
  `pstack:principle-attack-the-premise` (dragged three unvendored sibling
  principles), `pstack:principle-subtract-before-you-add` (Ponytail restatement),
  the `favorite` field (no consumer), the per-entry `content_sha256` and
  `size_bytes` fields (second copies of facts the file itself carries -- the
  inventory owns the hash, and `tests/portability.test.ts` measures the cap on
  disk), and the two generated artifacts (`catalog.compact.tsv`, `sources.lock`)
  with their generator.
- **Dependency closure**: every retained selectable body's intra-source
  references were resolved and the missing bytes vendored from the same pinned
  commits (Addy's security/performance/accessibility checklists and
  `floor-guard.md`, Supabase's three query references). Three license files were
  vendored at paths that did not mirror upstream (`pstack/LICENSE`,
  `thermos/LICENSE`, `skills/frontend-design/LICENSE.txt`) and were relocated,
  which the inventory's pin check now catches by construction.

### Second review pass

A follow-up review found four honesty gaps in the first pass; all four are fixed
above the line, not annotated away:

- **`pstack:blast-radius` was not self-contained.** The vault's flagship review
  auto-candidate opened "companion to `how` and `why`", took its PR context from
  "`why` step 2", and ended in an `arena` pass -- all three now inert here, so a
  worker following it hit dead ends. It is now served by
  `skills/adapted/pstack/blast-radius/SKILL.md`: the same method, with the
  direct `git log`/`git blame`/`git show`/`gh pr view` commands step 1 actually
  meant, `why`'s evidence rules stated inline, and the multi-model arena replaced
  by a second independent pass. `tests/selectable-safety.test.ts` now fails on
  *any* selectable body that hands off to a row no one can open.
- **The Brooks sibling notes were false.** `brooks-review`/`audit`/`debt`/`health`
  shared one copy-pasted note calling them a "read-only report generator", while
  their shared `_shared/common.md` reads `.brooks-lint.yaml`, appends
  `.brooks-lint-history.json` and writes suppressions. Each row now says what it
  is and names the steps a reader must skip; a test enforces that disclosure.
- **The Supabase row was hollow.** Its body is an index over a 34-file rule set
  of which three files are vendored, so it is `reference-only` now, with the note
  naming exactly what is local.
- **The Brooks acceptance test over-claimed.** It rendered a hand-written
  simulacrum of a review and called the result proof. The simulacrum is gone: the
  test now checks the body's static content contract and executes every shell
  command the body prescribes against a disposable Git project that must stay
  byte-identical. No test executes a review, and a test now fails if a doc says
  one does.

The captain accepted the `pstack:how` retirement from the first pass: it stays
`restricted`, with no local body.

## Testing

```console
$ bun test
```

`tests/local-integrity.test.ts` verifies every inventory row against its file
and, network-optionally, against the live pinned commit: it skips (with a clear
message, never a failure) only on genuine unreachability -- a reachable HTTP
error (a stale/broken pin) is always a hard failure.
`tests/dependency-closure.test.ts` proves every intra-source path reference in a
vendored body resolves to another inventory row (see that file's header for the
one recorded, checked exception and the honest scope of the check).
`tests/selectable-safety.test.ts` pins the audited unsafe entries out of the
selectable surface. `tests/brooks-adaptation.test.ts` checks the adapted Brooks
body's static content contract and executes every shell command that body
prescribes in a disposable Git project, which must be byte-identical
afterwards. No test executes the review itself -- a skill body is a prompt an
agent performs, and nothing here pretends to reproduce that.

## What this repo deliberately does not do

No CLI beyond the two-flag `bin/lookup.ts`. No generated files, so no
generator. No category→skill mapping table in any policy file. No service,
daemon, or background process. No registration into `~/.agents/skills` or any
OMP `skills.customDirectories`. No automatic merge of anything. Add machinery
only after real usage across several tasks shows the need.
