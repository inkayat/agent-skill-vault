import { describe, expect, test } from "bun:test";
import { FORBIDDEN_MARKERS, isCandidate } from "../bin/lib/catalog.ts";
import { loadCatalog, repoRoot } from "./helpers.ts";

/**
 * Orchestration safety of the WORKER-SELECTABLE surface (every firstmate_candidate row,
 * auto-candidate or explicit, plus the support files those bodies pull in).
 *
 * This asserts concrete, inspected facts -- the entries found unsafe in the post-merge audit
 * stay non-selectable, and the structural host/orchestration markers stay out of selectable
 * bodies. It is deliberately NOT a natural-language guarantee: prose can always describe
 * delegation without any of these markers, which is why classification is a curation act
 * recorded in catalog.yaml, not something a regex decides.
 */

/** Entries whose bodies drive subagents, worktrees, or external model CLIs: never selectable. */
const MUST_NOT_BE_SELECTABLE: Record<string, string> = {
  "pstack:how": "spawns parallel Task explorer subagents plus a synthesizer subagent",
  "addy:doubt-driven-development": "main-session orchestrator; spawns a reviewer, shells out to codex/gemini CLIs",
  "superpowers:writing-skills": "tests skills by running pressure scenarios with subagents; host-bound paths",
  "pstack:architect": "runs through a subagent runner-prompt",
  "pstack:why": "parallel investigator subagents plus a synthesizer subagent",
  "pstack:figure-it-out": "tells the reader to fan out and give each worker its own worktree or branch",
  "pstack:maintain-verification-skill": "launches one read-only subagent per feature file, concurrently",
  "pstack:principle-guard-the-context-window": "its mechanism is routing bulk output to subagents",
  "mattpocock:codebase-design": "drives design-it-twice by spinning up parallel sub-agents",
  "thermos:thermos": "dual-subagent launcher",
  "thermos:thermo-nuclear-review-subagent": "subagent wrapper",
  "thermos:thermo-nuclear-code-quality-review-subagent": "subagent wrapper",
  "superpowers:dispatching-parallel-agents": "parallel agent dispatch",
  "superpowers:subagent-driven-development": "subagent-driven workflow",
  "superpowers:executing-plans": "dispatches a subagent per task",
  "superpowers:using-git-worktrees": "owns worktree lifecycle",
  "superpowers:finishing-a-development-branch": "owns branch/merge lifecycle",
  "mattpocock:wayfinder": "task-system bootstrap",
  "mattpocock:to-spec": "task-system bootstrap",
  "mattpocock:to-tickets": "task-system bootstrap",
  "pstack:arena": "multi-agent arena",
  "pstack:swarm": "multi-agent swarm",
  "pstack:poteto-mode": "lifecycle/hook interception",
  "brooks:brooks-sweep": "iterative fix pipeline that edits the project",
};

async function selectableClosure(): Promise<Map<string, string[]>> {
  const catalog = await loadCatalog();
  const inventory = new Set(catalog.vendored.map((v) => v.path));
  const byEntry = new Map<string, string[]>();
  for (const e of catalog.entries.filter((x) => x.status === "firstmate_candidate")) {
    const files = [e.vault_path!];
    const text = await Bun.file(`${repoRoot()}${e.vault_path}`).text();
    const dir = e.vault_path!.split("/").slice(0, -1).join("/");
    for (const match of text.matchAll(/(?:\]\(|`)([A-Z][A-Z0-9-]*\.md|references\/[A-Za-z0-9_./-]+|scripts\/[A-Za-z0-9_./-]+)/g)) {
      const candidate = `${dir}/${match[1]}`;
      if (inventory.has(candidate)) files.push(candidate);
    }
    byEntry.set(e.id, [...new Set(files)]);
  }
  return byEntry;
}

describe("worker-selectable surface: orchestration and host safety", () => {
  test("every audited unsafe entry is non-selectable and carries no local body", async () => {
    const catalog = await loadCatalog();
    for (const [id, why] of Object.entries(MUST_NOT_BE_SELECTABLE)) {
      const entry = catalog.entries.find((e) => e.id === id);
      expect(entry, `${id} vanished from the catalog; re-audit before dropping this row`).toBeTruthy();
      expect(entry!.status, `${id} became selectable (${why})`).not.toBe("firstmate_candidate");
      expect(entry!.activation, `${id} must stay activation=never (${why})`).toBe("never");
      if (entry!.status !== "reference-only") expect(entry!.vault_path, id).toBeNull();
    }
  });

  test("no selectable body -- or support file it pulls in -- carries a forbidden host/orchestration marker", async () => {
    const closure = await selectableClosure();
    expect(closure.size).toBeGreaterThan(0);
    for (const [id, files] of closure) {
      for (const path of files) {
        const body = await Bun.file(`${repoRoot()}${path}`).text();
        for (const marker of FORBIDDEN_MARKERS) {
          expect(body.includes(marker), `${id}: ${path} contains forbidden marker "${marker}"`).toBe(false);
        }
      }
    }
  });

  test("the marker check covers explicit picks too, not only auto-candidates", async () => {
    const catalog = await loadCatalog();
    const explicitSelectable = catalog.entries.filter((e) => e.status === "firstmate_candidate" && !isCandidate(e));
    expect(explicitSelectable.length).toBeGreaterThan(0); // otherwise the test above proves less than it claims
  });

  test("no selectable body instructs the reader to launch an external model CLI", async () => {
    const closure = await selectableClosure();
    const CLI = /\b(codex exec|cursor-agent|claude -p|gemini --)/;
    for (const [id, files] of closure) {
      for (const path of files) {
        const body = await Bun.file(`${repoRoot()}${path}`).text();
        const hit = body.match(CLI);
        expect(hit?.[0], `${id}: ${path} invokes an external model CLI`).toBeUndefined();
      }
    }
  });

  test("the retained Brooks adaptation omits every prohibited lifecycle instruction", async () => {
    const catalog = await loadCatalog();
    const entry = catalog.entries.find((e) => e.id === "brooks:brooks-test")!;
    expect(entry.status).toBe("firstmate_candidate");
    expect(entry.activation).toBe("explicit");
    expect(entry.vault_path).toBe("skills/adapted/brooks/brooks-test/SKILL.md");
    const body = (await Bun.file(`${repoRoot()}${entry.vault_path}`).text()).split("-->")[1];
    for (const forbidden of ["brooks-sweep", "History Tracking", "Post-Report Triage", "--fix"]) {
      expect(body.includes(forbidden), `adapted Brooks body still mentions ${forbidden}`).toBe(false);
    }
    // The two project-mutating artifacts may appear only inside the read-only contract,
    // where they are named as things this review never touches.
    const contract = body.split("## Read-only contract")[1].split("\n## ")[0];
    for (const artifact of [".brooks-lint.yaml", ".brooks-lint-history.json"]) {
      expect(contract.includes(artifact), `${artifact} must be named in the read-only contract`).toBe(true);
      const outside = body.replace(contract, "");
      expect(outside.includes(artifact), `${artifact} appears outside the read-only contract`).toBe(false);
    }
  });
});
