<!--
Source: mattpocock/skills@c55ee46073ed923f86ce59a5eb3b6d895095d1b7:skills/engineering/code-review/SKILL.md
Modifications: Replaced the parallel-sub-agent fan-out with a single sequential
in-process pass over each axis -- no subagent, Task, or background-agent primitive
of any kind, so this runs identically on every host. Replaced the
`docs/agents/issue-tracker.md` / `setup-matt-pocock-skills` spec-bootstrap
dependency with "take the spec from the task brief" -- FirstMate briefs already
carry the spec; there is no tracker bootstrap step here. Everything else
(fixed-point pinning, the Fowler smell baseline, the two-axis separation
rationale) is unchanged from the source.
-->

---
name: code-review
description: "Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the task brief asked for?). Runs both reviews sequentially, in-process, in a single pass, and reports them side by side. Use when the task wants to review a branch, a PR, or work-in-progress changes."
---

Two-axis review of the diff between `HEAD` and a fixed point the task supplies:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement what the task brief asked for?

Both axes run **sequentially, in the same context, one pass each** -- no
subagent dispatch, no background process, nothing host-specific -- so
neither axis's findings bias the other's read of the diff. This skill then
aggregates both reports itself.

The spec is the task brief itself. There is no issue-tracker bootstrap step:
if the brief doesn't state what the change is meant to do, ask before reviewing.

## Process

### 1. Pin the fixed point

Whatever the task brief says is the fixed point (a commit SHA, branch name,
tag, `main`, `HEAD~5`, etc.). If it isn't stated, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so
the comparison is against the merge-base). Also note the list of commits via
`git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves
(`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty
diff should fail here, not partway through the Standards or Spec pass.

### 2. Identify the spec source

The spec is whatever the task brief states the change is meant to do. If the
brief names a spec file under `docs/`, `specs/`, or similar, read that too.
If the brief gives no spec at all, the Spec pass skips and the final report
notes "no spec available" -- never invent one and never fall back to
grepping an issue tracker.

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as
`CODING_STANDARDS.md` or `CONTRIBUTING.md`.

On top of whatever the repo documents, the Standards axis always carries the
**smell baseline** below: a fixed set of Fowler code smells (_Refactoring_,
ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it
  endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible
  Feature Envy"), never a hard violation. Like any standard here, skip
  anything tooling already enforces.

Each smell reads *what it is* -> *how to fix*; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't
  reveal what it does or holds. -> rename it; if no honest name comes, the
  design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or
  file in the change. -> extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more
  than its own. -> move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a
  type wanting to be born). -> bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain
  concept that deserves its own type. -> give the concept its own small
  type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type
  recurs across the change. -> replace with polymorphism, or one map both
  sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many
  files in the diff. -> gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated
  reasons. -> split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for
  needs the spec doesn't have. -> delete it; inline back until a real need
  shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't
  depend on. -> hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. ->
  cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides
  most of what it inherits. -> drop the inheritance, use composition.

### 4. Run both axes, sequentially, in this same context

Run the Standards pass, then the Spec pass. Never dispatch either as a
subagent, background process, or separate task: both stay in this one
context, one after the other.

**Standards pass** covers:

- The full diff command and commit list.
- The standards-source files found in step 3, plus the smell baseline above.
- Report, per file/hunk where relevant, (a) every place the diff violates a
  documented standard: cite the standard (file + the rule); and (b) any
  baseline smell spotted: name it and quote the hunk. Distinguish hard
  violations from judgement calls: documented-standard breaches can be hard,
  but baseline smells are always judgement calls, and a documented repo
  standard overrides the baseline. Skip anything tooling enforces. Under 400
  words.

**Spec pass** covers:

- The diff command and commit list.
- The spec identified in step 2.
- Report: (a) requirements the spec asked for that are missing or partial;
  (b) behaviour in the diff that wasn't asked for (scope creep); (c)
  requirements that look implemented but where the implementation looks
  wrong. Quote the spec line for each finding. Under 400 words.

If the spec is missing, skip the Spec pass and note this in the final
report.

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings,
verbatim or lightly cleaned. Do **not** merge or rerank findings, because
the two axes are deliberately separate (see _Why two axes_).

End with a one-line summary: total findings per axis, and the worst issue
_within each axis_ (if any). Don't pick a single winner across axes: that's
the reranking the separation exists to prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing ->
  **Standards pass, Spec fail.**
- Code that does exactly what the brief asked but breaks the project's
  conventions -> **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
