import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { loadCatalog, repoRoot } from "./helpers.ts";

const HEADER_RE = /^<!--\s*\nSource: (\S+)@([0-9a-f]{40}):(\S+)\nModifications: ([\s\S]+?)\n-->/;

async function adaptedFiles(): Promise<string[]> {
  const glob = new Glob("skills/adapted/**/*.md");
  const files: string[] = [];
  for await (const f of glob.scan({ cwd: repoRoot() })) {
    if (!f.endsWith("README.md")) files.push(f);
  }
  return files.sort();
}

describe("unmodified vs. adapted content stays clearly separated", () => {
  test("skills/adapted/ documents the convention", async () => {
    const readme = await Bun.file(`${repoRoot()}skills/adapted/README.md`).text();
    expect(readme).toContain("Source:");
    expect(readme).toContain("Modifications:");
  });

  test("every entry's vault_path lives in exactly one of skills/upstream/ or skills/adapted/, never both patterns at once", async () => {
    const catalog = await loadCatalog();
    for (const e of catalog.entries.filter((x) => x.status === "firstmate_candidate")) {
      const underUpstream = e.vault_path!.startsWith("skills/upstream/");
      const underAdapted = e.vault_path!.startsWith("skills/adapted/");
      expect(underUpstream !== underAdapted, e.id).toBe(true); // exactly one, by real path inspection
    }
  });

  test("every non-README file under skills/adapted/ opens with a Source/Modifications header whose Source matches its catalog entry's own source+commit+upstream_path", async () => {
    const catalog = await loadCatalog();
    const files = await adaptedFiles();
    expect(files.length).toBeGreaterThan(0); // mattpocock:code-review must exist
    for (const path of files) {
      const text = await Bun.file(`${repoRoot()}${path}`).text();
      const match = text.match(HEADER_RE);
      expect(match, `${path}: missing or malformed Source/Modifications header`).toBeTruthy();
      const [, repo, sha, upstreamPath, modifications] = match!;
      expect(modifications.trim().length, path).toBeGreaterThan(10); // not a placeholder

      const entry = catalog.entries.find((e) => e.vault_path === path);
      expect(entry, `no catalog entry points its vault_path at ${path}`).toBeTruthy();
      const source = catalog.sources[entry!.source];
      expect(repo, `${entry!.id}: header Source repo`).toBe(source.repo);
      expect(sha, `${entry!.id}: header Source commit`).toBe(source.sha);
      expect(upstreamPath, `${entry!.id}: header Source path`).toBe(entry!.upstream_path);
    }
  });

  test("mattpocock:code-review's adapted body genuinely differs from the unmodified upstream original it's derived from", async () => {
    const catalog = await loadCatalog();
    const entry = catalog.entries.find((e) => e.id === "mattpocock:code-review")!;
    const adaptedText = await Bun.file(`${repoRoot()}${entry.vault_path}`).text();
    const bodyAfterHeader = adaptedText.replace(HEADER_RE, "").trim();

    // Real modifications this adaptation makes, checked as observable text facts
    // (not just "it has a header" -- the tautology this replaces).
    expect(bodyAfterHeader).not.toContain("sub-agent");
    expect(bodyAfterHeader).not.toContain("docs/agents/issue-tracker.md");
    expect(bodyAfterHeader).not.toContain("setup-matt-pocock-skills");
    expect(bodyAfterHeader).toContain("task brief");
    expect(bodyAfterHeader).toContain("sequentially");

    const source = catalog.sources[entry.source];
    let reachable = true;
    let originalText = "";
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${source.repo}/${source.sha}/${entry.upstream_path}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      originalText = await res.text();
    } catch {
      reachable = false;
    }

    if (reachable) {
      expect(bodyAfterHeader).not.toBe(originalText.trim());
      expect(originalText).toContain("sub-agent"); // proves the original really did have what we stripped
      expect(originalText).toContain("docs/agents/issue-tracker.md");
    } else {
      console.warn("adapted-vs-original diff check: network unreachable -- skipped local text-fact checks above still ran.");
    }
  });

  test("only firstmate_candidate/reference-only entries ever point into skills/upstream/ or skills/adapted/; installed/catalog/team-only/restricted never do", async () => {
    const catalog = await loadCatalog();
    for (const e of catalog.entries) {
      if (e.status === "firstmate_candidate" || e.status === "reference-only") continue;
      expect(e.vault_path, e.id).toBeNull();
    }
  });
});
