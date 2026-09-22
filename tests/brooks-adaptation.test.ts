import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCatalog, repoRoot } from "./helpers.ts";

/**
 * Contract tests for the FirstMate-safe Brooks test-quality adaptation.
 *
 * A skill body is a prompt: an agent performs the review, so nothing here can execute it, and
 * no test in this repo may imply otherwise. What IS checkable, and is checked here:
 *
 * 1. Static contract -- the body still carries the diagnostic content a reviewer needs
 *    (every risk with symptoms, a book citation, a severity guide and a "do not flag" guard)
 *    and the concrete output contract (report template, health score arithmetic).
 * 2. Command safety, executed for real -- every shell command the body tells the reviewer to
 *    run is extracted from the body itself and run in a disposable Git project; the project
 *    must be byte-identical afterwards, with no `.brooks-lint*` or report artifact. This
 *    catches a future edit that reintroduces a mutating step, which is the actual risk.
 *
 * It does NOT claim to reproduce a review or to prove the findings an agent would emit.
 */

const ADAPTED = "skills/adapted/brooks/brooks-test/SKILL.md";
const RISKS = ["T1 Test Obscurity", "T2 Test Brittleness", "T3 Test Duplication", "T4 Mock Abuse", "T5 Coverage Illusion", "T6 Architecture Mismatch"];

let project = "";

async function git(args: string[], cwd = project): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) throw new Error(`git ${args.join(" ")} failed: ${await new Response(proc.stderr).text()}`);
  return out;
}

/** Every shell command the adapted body tells the reviewer to run, taken from the body. */
function prescribedCommands(body: string): string[] {
  return [...new Set([...body.matchAll(/`((?:git|gh|rm|mv|cp|echo|tee|sed)\s[^`]+)`/g)].map((m) => m[1].trim()))];
}

beforeAll(async () => {
  project = await mkdtemp(join(tmpdir(), "brooks-contract-"));
  await Bun.write(join(project, "src/order.ts"), "export function createOrder() {\n  return { id: 1 };\n}\n");
  await Bun.write(join(project, "src/order.test.ts"), 'import { expect, test } from "bun:test";\ntest("test1", () => {\n  expect(1).toBe(1);\n});\n');
  await git(["init", "-q"]);
  await git(["config", "user.email", "test@example.com"]);
  await git(["config", "user.name", "Contract Test"]);
  await git(["add", "-A"]);
  await git(["commit", "-qm", "fixture"]);
});

afterAll(async () => {
  if (project) await rm(project, { recursive: true, force: true });
});

describe("adapted Brooks test-quality review: static content contract", () => {
  test("every risk carries symptoms, a book citation, a severity guide and a do-not-flag guard", async () => {
    const body = await Bun.file(`${repoRoot()}${ADAPTED}`).text();
    for (const risk of RISKS) {
      const heading = body.indexOf(`### ${risk}`);
      expect(heading, `${risk} is missing from the adapted body`).toBeGreaterThan(-1);
      const nextHeading = body.indexOf("\n### ", heading + 1);
      const section = body.slice(heading, nextHeading === -1 ? body.indexOf("\n## Scan order") : nextHeading);
      expect(section, `${risk}: no book citation`).toMatch(/Meszaros|Osherove|Feathers|Google|Hunt & Thomas/);
      expect(section, `${risk}: no severity guide`).toContain("Severity:");
      expect(section, `${risk}: no "what not to flag" guard`).toContain("Do not flag:");
      expect(section.length, `${risk}: section is too thin to diagnose with`).toBeGreaterThan(600);
    }
  });

  test("the output contract is concrete: report template, Iron Law fields, health score arithmetic", async () => {
    const body = await Bun.file(`${repoRoot()}${ADAPTED}`).text();
    for (const required of [
      "Symptom -> Source -> Consequence -> Remedy",
      "**Mode:** Test Quality Review",
      "**Health Score:** XX/100",
      "Test Suite Map",
      "subtract 15 per 🔴, 5 per 🟡, 1 per 🟢",
      "70:20:10",
      "More than 3 mocks in a single unit test",
    ]) {
      expect(body.includes(required), `adapted skill no longer states: ${required}`).toBe(true);
    }
    expect(body).not.toContain("Trend:"); // no history state is kept between runs
  });
});

describe("adapted Brooks test-quality review: prescribed commands are read-only, executed for real", () => {
  test("the body prescribes shell commands, and all of them are git read commands", async () => {
    const body = await Bun.file(`${repoRoot()}${ADAPTED}`).text();
    const commands = prescribedCommands(body);
    expect(commands.length, "no commands extracted -- the extraction would prove nothing").toBeGreaterThan(0);
    for (const command of commands) {
      expect(command, `prescribes a non-git command: ${command}`).toMatch(/^git /);
      expect(command, `prescribes a mutating git command: ${command}`).toMatch(/^git (diff|log|status|blame|show|rev-parse)\b/);
    }
  });

  test("running every prescribed command leaves a disposable Git project byte-identical", async () => {
    const body = await Bun.file(`${repoRoot()}${ADAPTED}`).text();
    const head = (await git(["rev-parse", "HEAD"])).trim();

    for (const command of prescribedCommands(body)) {
      const proc = Bun.spawn(command.split(/\s+/), { cwd: project, stdout: "pipe", stderr: "pipe" });
      await proc.exited; // a command may legitimately fail (no `main` ref); it must not mutate
    }

    expect((await git(["status", "--porcelain"])).trim()).toBe("");
    expect((await git(["rev-parse", "HEAD"])).trim()).toBe(head);

    const stray = new Bun.Glob("**/{.brooks-lint.yaml,.brooks-lint-history.json,*review*.md,*report*.json}");
    const found: string[] = [];
    for await (const f of stray.scan({ cwd: project, onlyFiles: true, dot: true })) found.push(f);
    expect(found).toEqual([]);
  });
});

describe("adapted Brooks test-quality review: registration and provenance", () => {
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

  test("no doc claims a test executes the review", async () => {
    const claims: string[] = [];
    for (const file of ["README.md", "AGENTS.md", "skills/adapted/README.md", "catalog.yaml"]) {
      const text = await Bun.file(`${repoRoot()}${file}`).text();
      for (const line of text.split("\n")) {
        if (/brooks-adaptation\.test\.ts/.test(line) && /\bruns?\b (a|the) .*review|proves a review/.test(line)) {
          claims.push(`${file}: ${line.trim().slice(0, 120)}`);
        }
      }
    }
    expect(claims).toEqual([]);
  });
});
