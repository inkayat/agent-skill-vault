// End-to-end contract test for the real `bin/lookup.ts` CLI: proves the
// process-level output shape, not just the underlying catalog.ts functions.
import { describe, expect, test } from "bun:test";
import { repoRoot } from "./helpers.ts";

async function runLookup(...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "bin/lookup.ts", ...args], {
    cwd: repoRoot(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

describe("bin/lookup.ts --id: notes as a stable final field", () => {
  test("pstack:blast-radius emits its adaptation caveat as the last column", async () => {
    const { stdout, exitCode } = await runLookup("--id", "pstack:blast-radius");
    expect(exitCode).toBe(0);
    const lines = stdout.trimEnd().split("\n");
    expect(lines.length).toBe(1);
    const columns = lines[0].split("\t");
    expect(columns.length).toBe(9);
    expect(columns[0]).toBe("pstack:blast-radius");
    expect(columns[8]).toContain("self-contained adaptation");
  });

  test("brooks:brooks-test emits its adaptation caveat as the last column", async () => {
    const { stdout, exitCode } = await runLookup("--id", "brooks:brooks-test");
    expect(exitCode).toBe(0);
    const columns = stdout.trimEnd().split("\t");
    expect(columns.length).toBe(9);
    expect(columns[6]).toBe("skills/adapted/brooks/brooks-test/SKILL.md");
    expect(columns[8]).toContain("FirstMate-safe adaptation");
  });

  test("unsafe/non-resolvable ids still refuse (exit 1, stderr explains, no stdout row)", async () => {
    for (const id of ["gstack:cso", "pstack:arena", "nonexistent:id"]) {
      const { stdout, stderr, exitCode } = await runLookup("--id", id);
      expect(exitCode, id).toBe(1);
      expect(stdout, id).toBe("");
      expect(stderr, id).toContain("no row for id");
    }
  });
});

describe("bin/lookup.ts --category: unchanged 8-column shape", () => {
  test("REVIEW shortlist rows stay 8 columns each, matching the prior compact contract", async () => {
    const { stdout, exitCode } = await runLookup("--category", "REVIEW");
    expect(exitCode).toBe(0);
    const lines = stdout.trimEnd().split("\n");
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.split("\t").length).toBe(8);
    }
  });
});
