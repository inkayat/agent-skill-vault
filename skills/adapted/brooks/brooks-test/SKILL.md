<!--
Source: hyhmrright/brooks-lint@220fe716c01950966e961e020eda9c457f4dd0a7:skills/brooks-test/SKILL.md
Modifications: FirstMate-safe, read-only adaptation. Methodology (Iron Law, the six test
decay risks T1-T6 with their book sources and "what not to flag" guards, the five-step scan
order, the suite map, the report template and health score) is condensed from the upstream
brooks-test SKILL.md, brooks-test/test-guide.md and skills/_shared/{common,test-decay-risks}.md
at the same commit, so this one file replaces that whole multi-file read chain. Removed every
project-mutating and stateful step: `.brooks-lint.yaml` project-config loading, the
`.brooks-lint-history.json` history/trend append, Post-Report Triage with its `suppress:`
writes, Remedy Mode's `--fix` editing path, and the brooks-sweep pipeline hand-off. Removed
the interactive triage prompt loop; the one optional scoping question is kept and is
answer-optional. Upstream is MIT (c) hyhmrright; the vendored LICENSE is at
skills/upstream/hyhmrright-brooks-lint/LICENSE.
-->

# Test Quality Review (FirstMate-safe adaptation of Brooks-Lint mode 4)

Diagnose structural quality problems in an **existing** test suite: brittleness, mock abuse,
coverage illusions, slow suites, unreadable tests. Not for authoring new tests.

## Read-only contract

This review **only reads**. While running it you never:

- write, create, or delete any file in the project (no config, no history, no report file),
- run any command that mutates the working tree, index, or any ref,
- append to, or read behavior from, `.brooks-lint.yaml`, `.brooks-lint-history.json`, or any
  suppression list — those upstream mechanisms are removed here, not merely skipped,
- offer an interactive accept/dismiss/defer triage loop,
- apply a fix. Findings name a remedy; the caller decides whether to implement it.

The single deliverable is the report below, in your response. `git status --porcelain` must be
byte-identical before and after this review.

## The Iron Law

```
NEVER suggest fixes before completing risk diagnosis.
EVERY finding must follow: Symptom -> Source -> Consequence -> Remedy.
```

A finding without a consequence and a remedy is noise, not a finding.

## Scope

If the caller named test files or a test directory, that is the scope. Otherwise detect it with
read-only commands only: `git diff --cached --name-only`, then `git diff --name-only`, then
`git diff main...HEAD --name-only`; with a diff, prioritize test files co-located with the
changed production files (`src/foo.ts` -> `src/foo.test.ts`); with no diff, take all test files.

Always state what you scanned: `Scope: branch changes vs main (12 files)`.

If you cannot read the test files at all, ask **one** question (the most relevant), then proceed
with whatever answer you get, including none:

1. Which module is hardest to test, or has the least coverage?
2. When you make a change, how often do unrelated tests break?
3. Is there a part of the codebase the team avoids touching because it has no tests?

## Before you start: build the test suite map

```
Unit tests:        X files, ~N tests
Integration tests: X files, ~N tests
E2E tests:         X files, ~N tests
Ratio:             Unit X%  :  Integration X%  :  E2E X%
Coverage areas:    [modules with tests] vs [modules without tests]
```

## The six test decay risks

Scan in the step order below, not in code order.

### T1 Test Obscurity — how much effort to understand what this test verifies?

- Assertion Roulette: several assertions, no message strings, so a failure does not say which
  behavior broke.
- Mystery Guest: the test depends on files, database rows, env vars, or shared fixtures that are
  invisible in the test body.
- Names that do not express subject + scenario + expected outcome (`test1`, `shouldWork`).
- General Fixture: one oversized `setUp`/`beforeEach` inherited by unrelated tests.
- Sources: Meszaros, *xUnit Test Patterns* — Assertion Roulette (p.224), Mystery Guest (p.411),
  General Fixture (p.316); Osherove, *The Art of Unit Testing* — method_scenario_expected naming.
- Severity: 🔴 no test name in the file describes a behavior and no assertion carries a message ·
  🟡 several Mystery Guests or ambiguous names · 🟢 isolated naming or fixture issues.
- Do not flag: several assertions that tell one coherent story; shared setup every test really
  uses; short names whose scenario and outcome are still obvious.

### T2 Test Brittleness — do tests break on refactors that change no behavior?

- Assertions on private methods, internal state, or implementation detail instead of observable
  behavior.
- Eager Test: one test method verifying several unrelated behaviors.
- Over-specification: asserting mock call order or exact arguments irrelevant to the behavior.
- Renaming or extracting one method breaks 5+ tests with no behavior change.
- Erratic Test: results vary across runs (time, randomness, shared mutable state, races).
- Sources: Meszaros — Eager Test (p.228), Erratic Test; Osherove — test isolation;
  Hunt & Thomas, *The Pragmatic Programmer* — Ch. 2 Orthogonality.
- Severity: 🔴 behavior-preserving refactor fails tests, or >5 tests coupled to one internal
  detail · 🟡 Eager Tests common, moderate implementation coupling · 🟢 isolated over-specification.
- Do not flag: asserting an externally observable event or emitted command; several assertions
  supporting one behavior claim; fakes or in-memory adapters that still assert behavior.

### T3 Test Duplication — is the same scenario expressed in more than one place?

- Copy-pasted setup or assertion blocks with no shared helper.
- Lazy Test: several tests with identical input, state, and expectation.
- The same boundary condition tested identically at unit, integration, and E2E level.
- Sources: Meszaros — Test Code Duplication (p.213), Lazy Test (p.232); Hunt & Thomas — DRY.
- Severity: 🔴 a core scenario fully duplicated across all three layers · 🟡 the same setup
  repeated in 5+ tests · 🟢 minor helper duplication. Instance counts break ties: 10+ / 3-9 / 1-2.
- Do not flag: one scenario at two layers when each layer covers a distinct risk; small local
  setup that reads better than an abstract fixture; similar assertions over different domain rules.

### T4 Mock Abuse — is the test more complex than the behavior it tests?

- Mock setup longer than the test logic (a setup-to-assertion ratio above 3:1 is at least 🟡).
- The primary assertion is `expect(mock).toHaveBeenCalledWith(...)` rather than an assertion on
  output, state, or an observable event.
- Test-only methods on production classes (test-induced design damage).
- More than 3 mocks in a single unit test.
- Incomplete Mock: missing fields downstream code will read.
- Hard-Coded Test Data with no resemblance to real shapes or constraints.
- Sources: Meszaros — Behavior Verification (p.544), Hard-Coded Test Data (p.534); Osherove —
  mock count and completeness; Feathers, *Working Effectively with Legacy Code* — Ch. 3 Sensing
  and Separation.
- Severity: 🔴 mock setup >50% of test code, or production methods that exist only for tests ·
  🟡 consistently >3 mocks per test, or mock-call assertions as the primary check · 🟢 isolated
  Incomplete Mocks or Hard-Coded Test Data.
- Do not flag: a couple of mocks around nondeterministic dependencies when assertions still check
  behavior; fakes and spies observing state transitions; an interaction assertion when the
  interaction *is* the behavior under test.

### T5 Coverage Illusion — does the suite protect against the failures that matter?

- High line coverage with untested error branches, boundaries, and exception paths.
- Happy path only: no null/empty/zero inputs, no sad paths, no concurrency edges.
- Legacy code being actively modified with no tests ("legacy code is code without tests").
- Coverage percentage used as a sign-off criterion while critical change paths stay untested.
- Assertions on return values but not on side effects (writes, emitted events, state transitions).
- Sources: Feathers — Ch. 1; Google, *How Google Tests Software* — Ch. 11 change vs line coverage;
  Osherove — test completeness.
- Severity: 🔴 legacy code under modification with no tests, or error paths entirely absent ·
  🟡 coverage >80% with edge and exception paths systematically missing · 🟢 a few non-critical
  sad paths missing.
- Do not flag: high line coverage paired with branch, boundary, and change-path coverage; a new
  private low-risk module; side-effect assertions that live in integration tests instead.

### T6 Architecture Mismatch — does the suite's shape match the system's risk profile?

- Inverted pyramid: integration + E2E count exceeds unit count.
- Legacy code with no seams (no interfaces, no injection), untestable without editing production.
- Legacy areas under modification with no Characterization Tests capturing current behavior first.
- Full suite runtime over 10 minutes — an architecture problem, not a performance one. Over 30
  minutes, or unknown because nobody runs it, is still 🟡; runtime alone never reaches 🔴.
- High-risk and trivial paths tested at identical density.
- Sources: Google — 70:20:10 unit:integration:E2E; Feathers — Ch. 4 Seam Model, Ch. 13
  Characterization Tests; Meszaros — Slow Tests (p.253).
- Severity: 🔴 legacy code under modification with no seams and no characterization tests, or a
  fully inverted pyramid · 🟡 suite over 10 minutes, or integration+E2E outnumbering unit tests ·
  🟢 local ratio deviation, a few legacy areas without characterization tests.
- Do not flag: a justified deviation from 70:20:10; an integration-heavy suite with fast,
  deliberately layered feedback; a small number of critical-path E2E tests.

Characterization Test template, when T5/T6 calls for one:

```
test("characterize: [module].[method] given [input], returns [current output]") {
  // Call the code under test with realistic inputs.
  // Assert whatever it currently returns, even if you suspect the output is wrong.
  // Comment: "This captures current behavior, not necessarily correct behavior."
}
```

## Scan order

1. **T1 Obscurity** first: read 5-10 test names at random and judge them without opening bodies.
2. **T2 Brittleness and T4 Mock Abuse together**: sample 3-5 test bodies once, check both, write
   separate findings when both are present.
3. **T3 Duplication** across files.
4. **T5 Coverage Illusion and T6 Architecture Mismatch**: take the most recently modified core
   module, check its error and boundary paths, then compare the suite map against the pyramid and
   the measured (or explicitly unknown) runtime.
5. Apply the Iron Law to every finding and output the report.

## Report template

````
# Test Quality Review

**Mode:** Test Quality Review
**Scope:** [files, directory, or what was detected]
**Health Score:** XX/100

[One-sentence verdict]

```
Test Suite Map
...
```

## Findings

<!-- Critical first, then Warning, then Suggestion; omit an empty tier -->

### 🔴 Critical

**[Risk name] — [short title]**
Symptom: [exactly what was observed]
Source: [Book — principle or smell]
Consequence: [what gets worse if unfixed]
Remedy: [concrete action, not applied by this review]

### 🟡 Warning

### 🟢 Suggestion

## Summary

[2-3 sentences: the most important action, and the overall trend]
````

Health Score: start at 100, subtract 15 per 🔴, 5 per 🟡, 1 per 🟢; floor 0. No trend line, no
history file: this review keeps no state between runs.
