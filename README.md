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
- **`favorite` is not "globally active."** It marks an item the captain's
  manifest named explicitly (a strong/existing pick), independent of
  `status`/`activation`. A `favorite: true` row can still be `restricted` and
  never load.
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
  byte-identical to the pinned commit. `content_sha256` records the hash;
  `tests/local-integrity.test.ts` verifies both that the local file matches
  its recorded hash and (network-optional) that it's still byte-identical to
  the live commit it claims to be pinned at.
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
| `catalog.yaml` | **Hand-maintained.** The single source of truth: one `sources` map (one entry per upstream repo/plugin, with license/provenance) and one `entries` list (one row per skill/book/item). |
| `catalog.compact.tsv` | **Generated.** `bin/render.ts` output. Columns: `id status activation scope categories cluster cache_path candidate`. `candidate` is the derived `status=firstmate_candidate ∧ activation=auto-candidate` boolean. Only `installed`/`firstmate_candidate`/`reference-only` rows appear. |
| `sources.lock` | **Generated.** `<source-id>\t<repo>\t<sha>` for every *pinned* source (excludes metadata-only sources with unclear licenses). |
| `skills/upstream/` | Untouched upstream snapshots, one subtree per source, including each source's vendored `LICENSE`. |
| `skills/adapted/` | Rewritten derivatives, each header-tagged with its source and modifications. |
| `bin/lib/catalog.ts` | Schema, validation, and render/lookup logic shared by every consumer. |
| `bin/render.ts` | Regenerates the two generated files from `catalog.yaml`. `--check` exits non-zero on drift instead of writing. |
| `bin/lookup.ts` | The read-only lookup CLI (below). |
| `tests/` | `bun test` -- schema, provenance (incl. the split pstack/Thermos licenses), exact paths/commits, generated-file drift, safe status/activation combinations, local vendored-content integrity for both `firstmate_candidate` and `reference-only` rows (hard-fail on missing file or hash mismatch; network-optional pin-staleness check where a reachable 404 is a failure, not a skip), auto-candidate portability + size limits (local, deterministic), explicit-id lookup (including reference-only rows resolving to a real path), category shortlist behavior (structurally excludes reference-only), no-aggregator-mirroring, unmodified-vs-adapted separation (with a real content-diff check, not a tautology). |

Never hand-edit `catalog.compact.tsv` or `sources.lock`. Edit `catalog.yaml`,
then run `bun bin/render.ts`.

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
  is **derived**, never stored, but **is emitted** as `catalog.compact.tsv`'s
  last column (`bin/lib/catalog.ts`: `isCandidate`).
- `scope`: `worker` | `captain` | `worker+captain`. Captain-scope rows are
  read by the human/Captain only when explicitly asked for that mode
  (planning, interrogation, retros), never during routine task dispatch.
- `categories`: an optional, multi-valued **hint**, not a rule. No
  category→skill table exists in policy; nothing loads because a category
  matched.
- `cluster`: groups items that cover the same problem space (e.g. every
  root-cause-debugging treatment across five upstreams is `cluster:
  debugging`) so the reasoning behind picking one over another stays
  attached to the data.
- `favorite`: the captain's manifest named this item explicitly (strong or
  existing pick). Independent of `status`/`activation` -- see the boundary
  note above.
- `upstream_path`: where this entry was read from in its source repo
  (provenance only).
- `vault_path`: the real local file a worker/Captain actually reads.
  Non-null for `firstmate_candidate` and `reference-only` rows only.
- `content_sha256`: sha256 of the vendored file at `vault_path`, required
  wherever `vault_path` is set; verified against the real file on every
  test run.

## Looking something up

```console
$ bun bin/lookup.ts --id pstack:blast-radius
pstack:blast-radius	firstmate_candidate	auto-candidate	worker	REVIEW,DEEP	review	skills/upstream/cursor-plugins-pstack/pstack/skills/blast-radius/SKILL.md	true	Prove the one safety fact by running code. Note: skip the arena step.

$ bun bin/lookup.ts --category REVIEW
mattpocock:codebase-design	firstmate_candidate	auto-candidate	worker	ARCHITECTURE,REVIEW	architecture	skills/upstream/mattpocock-skills/skills/engineering/codebase-design/SKILL.md	true
pstack:blast-radius	firstmate_candidate	auto-candidate	worker	REVIEW,DEEP	review	skills/upstream/cursor-plugins-pstack/pstack/skills/blast-radius/SKILL.md	true
pstack:principle-encode-lessons-in-structure	firstmate_candidate	auto-candidate	worker	REVIEW,IMPLEMENT	meta	skills/upstream/cursor-plugins-pstack/pstack/skills/principle-encode-lessons-in-structure/SKILL.md	true
pstack:principle-test-behavior-not-implementation	firstmate_candidate	auto-candidate	worker	IMPLEMENT,REVIEW	tdd	skills/upstream/cursor-plugins-pstack/pstack/skills/principle-test-behavior-not-implementation/SKILL.md	true
pstack:principle-type-system-discipline	firstmate_candidate	auto-candidate	worker	IMPLEMENT,ARCHITECTURE,REVIEW	architecture	skills/upstream/cursor-plugins-pstack/pstack/skills/principle-type-system-discipline/SKILL.md	true
pstack:typescript-best-practices	firstmate_candidate	auto-candidate	worker	IMPLEMENT,REVIEW	architecture	skills/upstream/cursor-plugins-pstack/pstack/skills/typescript-best-practices/SKILL.md	true
pstack:unslop	firstmate_candidate	auto-candidate	worker	RESEARCH,REVIEW,ARCHITECTURE,TENTH-MAN	docs	skills/upstream/cursor-plugins-pstack/pstack/skills/unslop/SKILL.md	true
thermos:thermo-nuclear-review	firstmate_candidate	auto-candidate	worker	REVIEW	review	skills/upstream/cursor-plugins-thermos/thermos/skills/thermo-nuclear-review/SKILL.md	true

$ bun bin/lookup.ts --id mattpocock:grilling
mattpocock:grilling	reference-only	never	captain		planning	skills/upstream/mattpocock-skills/skills/productivity/grilling/SKILL.md	false	Added under delegated stronger-alternative research (not a direct captain approval): the real target of the grill-me/grill-with-docs router stubs, which otherwise point at two-line files with no content of their own. Vendored locally (real vault_path); explicit-id/captain reference only, never category/auto selection.

$ bun bin/lookup.ts --id brooks:brooks-test
brooks:brooks-test	reference-only	never	worker		tdd	skills/upstream/hyhmrright-brooks-lint/skills/brooks-test/SKILL.md	false	35-45KB including skills/_shared/{common,decay-risks,test-decay-risks,source-coverage,remedy-guide,custom-risks-guide}.md, required by every brooks-* skill. Clean MIT, original synthesis with citations (3 quotation marks total in decay-risks.md; no reproduced book text found), read-only report generator. Cost disqualifies auto-candidate: one invocation is ~4x the largest candidate body. Never vault a single skill dir without the whole repo (the _shared/ parent). Vendored locally (real vault_path); explicit-id/captain reference only, never category/auto selection.

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
2. Re-fetch and re-vendor every affected entry's `vault_path`, and recompute
   its `content_sha256`.
3. `bun bin/render.ts`
4. `bun test`
5. Commit `catalog.yaml`, `catalog.compact.tsv`, `sources.lock`, and the
   updated `skills/upstream/...` files together.

A pin bump that introduces an orchestration primitive or a host-binding
marker into an `auto-candidate` body fails `tests/portability.test.ts`
(local, deterministic, always runs). A pin bump whose new content doesn't
match the recorded `content_sha256` fails `tests/local-integrity.test.ts`
(also local, always runs) -- and if the live commit no longer serves the
recorded path at all, the network-optional half of that same test fails
loudly instead of skipping, because a reachable 404 is a broken pin, not an
offline environment.

## Considered, not adopted

The full reasoning lives in `catalog.yaml`'s `notes` fields (one per entry);
this is a summary of what was deliberately excluded and why, so the research
behind each exclusion is not silently redone on a future pass:

- **Orchestration/lifecycle** (`restricted`/`team-only`): pstack
  `poteto-mode`/`arena`/`swarm`/`interrogate`/`reflect`; Thermos's `thermos`
  orchestrator and both subagent wrappers; gstack's `cso`/`benchmark`/
  `qa-only`/`careful`/`freeze`/`guard`; Brooks Lint's `brooks-sweep`;
  Superpowers' `using-superpowers`/`using-git-worktrees`/
  `finishing-a-development-branch`/`dispatching-parallel-agents`/
  `subagent-driven-development`/`executing-plans`; Matt Pocock's
  `wayfinder`/`to-spec`/`to-tickets`. FirstMate owns task lifecycle,
  worktrees, branches, and merges; these either spawn subagents via a
  host-specific primitive, intercept every tool call via a host-specific
  hook API, or bootstrap a tracker FirstMate doesn't use.
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
  reference only, never category/auto): pstack `why`/`architect`/
  `show-me-your-work`; all five Brooks Lint `brooks-*` review skills with
  their complete `_shared`/guide dependency chain (clear MIT license; cost
  no longer disqualifies once a body is explicit-id-only rather than
  auto-loaded); Superpowers' `brainstorming`/`writing-plans`/
  `requesting-code-review`; Addy Osmani's `browser-testing-with-devtools`/
  `interview-me`/`idea-refine`; Anthropic `webapp-testing`; Matt Pocock's
  `grill-me`/`grill-with-docs`/`grilling`/`domain-modeling`/
  `improve-codebase-architecture`/`research`. Each is interactive, or
  MCP/tool-dependent for its *workflow*, or otherwise not something an
  unattended worker invokes on its own -- but the text itself is safe,
  clear-license, and worth having offline for the human/Captain to read by
  exact id.
- **Duplicative of an installed skill** (`explicit`, not `auto-candidate`):
  pstack's `principle-prove-it-works`/`principle-fix-root-causes`/
  `principle-subtract-before-you-add`/`principle-minimize-reader-load`; Addy
  Osmani's `code-simplification`/`debugging-and-error-recovery`. Each
  restates an already-installed skill (`verification-before-completion`,
  `systematic-debugging`, `ponytail`) at a different scale -- kept as
  `explicit` complements, not folded in, not promoted to `auto-candidate`.
- **Adapted instead of vendored unmodified**: Matt Pocock's `code-review`
  couldn't be made host-independent as-is (parallel-subagent fan-out plus an
  issue-tracker/`setup-matt-pocock-skills` bootstrap dependency), so it's a
  real rewritten derivative at `skills/adapted/mattpocock/code-review/SKILL.md`
  -- sequential, in-process, no subagent/Task/background-process primitive
  of any kind -- rather than an unmodified `skills/upstream/` snapshot. See
  `skills/adapted/README.md`.

## Delegated-stronger-alternative-research additions

Three items not in the original named manifest were added after a delegated
stronger-alternative-research pass, not a direct captain approval (see
`catalog.yaml` notes on each): pstack `tdd` (lighter, bug-fix-scoped TDD;
`explicit`), pstack `principle-attack-the-premise` (`auto-candidate`,
narrow DEEP trigger), and Matt Pocock `grilling` (`reference-only`; the real
target of the `grill-me`/`grill-with-docs` router stubs, which otherwise
point at two-line files with no content of their own).

## Testing

```console
$ bun test
```

`tests/local-integrity.test.ts`'s pin-integrity check fetches every
`skills/upstream/` file live from GitHub at its pinned commit when the
network is reachable, and skips (with a clear message, never a failure)
only on genuine unreachability -- a reachable HTTP error (a stale/broken
pin) is always a hard failure, never silently skipped.

## What this repo deliberately does not do

No CLI beyond the two-flag `bin/lookup.ts`. No category→skill mapping table
in any policy file. No service, daemon, or background process. No
registration into `~/.agents/skills` or any OMP `skills.customDirectories`.
No automatic merge of anything. Add machinery only after real usage across
several tasks shows the need.
