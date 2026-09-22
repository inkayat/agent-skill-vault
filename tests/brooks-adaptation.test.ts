import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCatalog, repoRoot } from "./helpers.ts";

/**
 * Acceptance test for the FirstMate-safe Brooks test-quality adaptation.
 *
 * A real disposable Git project is created, seeded with a deliberately decayed test suite,
 * and reviewed by the deterministic fixture-level equivalent of the adapted skill: the
 * numeric rules the skill states in its own text (mock count, assertion messages, pyramid
 * shape) are applied and rendered through the skill's own report template. The harness is
 * pinned to the skill body -- every threshold and risk code it uses must appear verbatim in
 * skills/adapted/brooks/brooks-test/SKILL.md -- so the two cannot drift apart silently.
 *
 * Then the important half: the project must be byte-identical afterwards. `git status
 * --porcelain` empty, no `.brooks-lint*` artifact, no report file written anywhere.
 */

const ADAPTED = "skills/adapted/brooks/brooks-test/SKILL.md";

interface Finding {
  risk: string;
  severity: "Critical" | "Warning" | "Suggestion";
  title: string;
  symptom: string;
  source: string;
  consequence: string;
  remedy: string;
}

let project = "";

const DECAYED_UNIT_TEST = `import { expect, test } from "bun:test";
import { createOrder } from "./order";

test("test1", () => {
  const repo = mockRepo();
  const pricing = mockPricing();
  const tax = mockTax();
  const audit = mockAudit();
  const mailer = mockMailer();
  createOrder({ repo, pricing, tax, audit, mailer });
  expect(repo.save).toHaveBeenCalledWith({ id: 1 });
  expect(pricing.quote).toHaveBeenCalled();
  expect(audit.write).toHaveBeenCalled();
});

test("shouldWork", () => {
  const repo = mockRepo();
  expect(createOrder({ repo })).toBeTruthy();
  expect(repo.save).toHaveBeenCalled();
});
`;

const E2E_TEST = `import { test, expect } from "bun:test";
test("checkout flow end to end", async () => {
  expect(await checkout()).toBe("ok");
});
`;

async function git(args: string[], cwd = project): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) throw new Error(`git ${args.join(" ")} failed: ${await new Response(proc.stderr).text()}`);
  return out;
}

/** The skill's Step 1/2b/4 rules, applied mechanically to the fixture. Read-only by construction. */
async function review(root: string): Promise<{ report: string; findings: Finding[]; map: string }> {
  const glob = new Bun.Glob("**/*.test.ts");
  const testFiles: string[] = [];
  for await (const f of glob.scan({ cwd: root, onlyFiles: true })) testFiles.push(f);
  testFiles.sort();

  const unit = testFiles.filter((f) => !f.includes("e2e"));
  const e2e = testFiles.filter((f) => f.includes("e2e"));
  const findings: Finding[] = [];

  for (const file of testFiles) {
    const text = await Bun.file(join(root, file)).text();
    const tests = [...text.matchAll(/\btest\(\s*"([^"]+)"/g)].map((m) => m[1]);
    const mocks = [...text.matchAll(/\bmock[A-Z]\w*\(/g)].length;
    const vagueNames = tests.filter((t) => /^(test\d*|shouldWork|testLogin)$/.test(t));
    const mockAssertions = [...text.matchAll(/expect\([^)]*\)\.toHaveBeenCalled/g)].length;
    const messagedAssertions = [...text.matchAll(/expect\([^)]*,\s*["'`]/g)].length;

    if (vagueNames.length > 0) {
      findings.push({
        risk: "T1 Test Obscurity",
        severity: "Warning",
        title: `${file}: test names do not express scenario or expected outcome`,
        symptom: `${vagueNames.length} of ${tests.length} test names are non-descriptive (${vagueNames.join(", ")}), and ${messagedAssertions} assertions carry a message string`,
        source: "Osherove - The Art of Unit Testing (method_scenario_expected naming); Meszaros - xUnit Test Patterns, Assertion Roulette (p.224)",
        consequence: "a failure does not say which behavior broke, so the suite is read as noise and eventually ignored",
        remedy: "rename each test to subject + scenario + expected outcome, and give multi-assertion tests message strings",
      });
    }
    if (mocks > 3) {
      findings.push({
        risk: "T4 Mock Abuse",
        severity: "Warning",
        title: `${file}: more than 3 mocks in a single unit test`,
        symptom: `${mocks} mock objects constructed, and ${mockAssertions} of the assertions verify a mock call rather than an output or state change`,
        source: "Osherove - The Art of Unit Testing (mock count > 3); Meszaros - xUnit Test Patterns, Behavior Verification (p.544)",
        consequence: "the test passes while the real behavior is broken, because only the wiring is asserted",
        remedy: "assert the observable result of createOrder and replace the collaborator mocks with one fake for the nondeterministic dependency",
      });
    }
  }

  if (e2e.length > 0 && unit.length <= e2e.length) {
    findings.push({
      risk: "T6 Architecture Mismatch",
      severity: "Warning",
      title: "suite shape is inverted against the 70:20:10 pyramid",
      symptom: `${unit.length} unit test file(s) vs ${e2e.length} end-to-end file(s)`,
      source: "Google - How Google Tests Software (70:20:10 unit:integration:E2E)",
      consequence: "feedback is slow and fragile, so developers stop running the suite locally",
      remedy: "push the checkout assertions down to unit level and keep E2E for one critical path",
    });
  }

  const map = [
    `Unit tests:        ${unit.length} files, ~${unit.length * 2} tests`,
    `Integration tests: 0 files, ~0 tests`,
    `E2E tests:         ${e2e.length} files, ~${e2e.length} tests`,
  ].join("\n");

  const score = Math.max(0, 100 - findings.filter((f) => f.severity === "Critical").length * 15 - findings.filter((f) => f.severity === "Warning").length * 5 - findings.filter((f) => f.severity === "Suggestion").length);

  const report = [
    "# Test Quality Review",
    "",
    "**Mode:** Test Quality Review",
    `**Scope:** ${testFiles.length} test files (all test files)`,
    `**Health Score:** ${score}/100`,
    "",
    "```",
    "Test Suite Map",
    map,
    "```",
    "",
    "## Findings",
    "",
    ...findings.map((f) => [`### ${f.severity === "Critical" ? "🔴 Critical" : f.severity === "Warning" ? "🟡 Warning" : "🟢 Suggestion"}`, "", `**${f.risk} — ${f.title}**`, `Symptom: ${f.symptom}`, `Source: ${f.source}`, `Consequence: ${f.consequence}`, `Remedy: ${f.remedy}`, ""].join("\n")),
    "## Summary",
    "",
    "Mock-heavy interaction tests and unnamed scenarios are the highest-leverage fixes; the suite shape is inverted.",
  ].join("\n");

  return { report, findings, map };
}

beforeAll(async () => {
  project = await mkdtemp(join(tmpdir(), "brooks-acceptance-"));
  await Bun.write(join(project, "src/order.ts"), "export function createOrder(deps: unknown) {\n  return { id: 1, deps };\n}\n");
  await Bun.write(join(project, "src/order.test.ts"), DECAYED_UNIT_TEST);
  await Bun.write(join(project, "e2e/checkout.e2e.test.ts"), E2E_TEST);
  await git(["init", "-q"]);
  await git(["config", "user.email", "test@example.com"]);
  await git(["config", "user.name", "Acceptance Test"]);
  await git(["add", "-A"]);
  await git(["commit", "-qm", "fixture"]);
});

afterAll(async () => {
  if (project) await rm(project, { recursive: true, force: true });
});

describe("adapted Brooks test-quality review: useful output on a disposable project", () => {
  test("produces Iron-Law findings for every planted decay symptom", async () => {
    const { findings, report } = await review(project);
    const risks = findings.map((f) => f.risk);
    expect(risks).toContain("T1 Test Obscurity");
    expect(risks).toContain("T4 Mock Abuse");
    expect(risks).toContain("T6 Architecture Mismatch");

    for (const f of findings) {
      for (const field of [f.symptom, f.source, f.consequence, f.remedy]) expect(field.length, f.title).toBeGreaterThan(20);
      expect(f.source).toMatch(/Meszaros|Osherove|Feathers|Google|Hunt/); // a real book citation, not a rule id
    }
    expect(report).toContain("**Mode:** Test Quality Review");
    expect(report).toContain("Test Suite Map");
    expect(report).toMatch(/\*\*Health Score:\*\* \d+\/100/);
    expect(report).toContain("Symptom:");
    expect(report).toContain("Remedy:");
    expect(report).not.toContain("Trend:"); // no history state is kept
  });

  test("the harness's rules and vocabulary all come from the adapted skill body (no silent drift)", async () => {
    const skill = await Bun.file(`${repoRoot()}${ADAPTED}`).text();
    for (const phrase of [
      "More than 3 mocks in a single unit test",
      "Symptom -> Source -> Consequence -> Remedy",
      "70:20:10",
      "T1 Test Obscurity",
      "T4 Mock Abuse",
      "T6 Architecture Mismatch",
      "subtract 15 per 🔴, 5 per 🟡, 1 per 🟢",
    ]) {
      expect(skill.includes(phrase), `adapted skill no longer states: ${phrase}`).toBe(true);
    }
  });

  test("the reviewed project is byte-identical afterwards: clean git status, no brooks artifacts", async () => {
    const before = await git(["rev-parse", "HEAD"]);
    await review(project);
    expect((await git(["status", "--porcelain"])).trim()).toBe("");
    expect((await git(["rev-parse", "HEAD"])).trim()).toBe(before.trim());

    const stray = new Bun.Glob("**/{.brooks-lint.yaml,.brooks-lint-history.json,*review*.md,*report*.json}");
    const found: string[] = [];
    for await (const f of stray.scan({ cwd: project, onlyFiles: true, dot: true })) found.push(f);
    expect(found).toEqual([]);
  });

  test("the adaptation is registered as an adaptation, and the upstream snapshot was not modified to get there", async () => {
    const catalog = await loadCatalog();
    const entry = catalog.entries.find((e) => e.id === "brooks:brooks-test")!;
    expect(entry.vault_path).toBe(ADAPTED);
    expect(entry.upstream_path).toBe("skills/brooks-test/SKILL.md");
    // Nothing under skills/upstream/ was rewritten for this: no inventory row for that source
    // points at an adapted path, and every upstream row still hashes to its pinned commit
    // (tests/local-integrity.test.ts). The adaptation is a separate file with its own header.
    const brooksRows = catalog.vendored.filter((v) => v.source === "hyhmrright-brooks-lint");
    expect(brooksRows.some((v) => v.path === ADAPTED && v.upstream_path === null)).toBe(true);
    expect(brooksRows.filter((v) => v.path.startsWith("skills/upstream/")).every((v) => v.upstream_path !== null)).toBe(true);
  });
});
