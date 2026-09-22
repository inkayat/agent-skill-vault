import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { loadCatalog, repoRoot } from "./helpers.ts";

/**
 * Everything here reads the ONE authoritative vendored-file inventory (`vendored:` in
 * catalog.yaml). No hash, path, or commit is repeated in this file: a pin bump edits the
 * inventory, and these tests follow it.
 */

/** Repo's own documentation under skills/, deliberately not vendored content. */
const REPO_OWNED_UNDER_SKILLS = "skills/adapted/README.md";

async function sha256Hex(text: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(text);
  return hasher.digest("hex");
}

/** true = genuinely unreachable (offline/DNS/timeout); false = we got an HTTP response. */
async function fetchRawOrSkip(
  repo: string,
  sha: string,
  path: string,
): Promise<{ reachable: true; res: Response } | { reachable: false }> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${path}`, { signal: AbortSignal.timeout(10000) });
    return { reachable: true, res };
  } catch {
    return { reachable: false };
  }
}

async function filesUnderSkills(): Promise<string[]> {
  const glob = new Glob("skills/**/*");
  const out: string[] = [];
  for await (const f of glob.scan({ cwd: repoRoot(), onlyFiles: true })) out.push(f);
  return out.sort();
}

describe("the vendored inventory covers exactly what is on disk (hard-fail, no skip)", () => {
  test("every inventory row exists on disk and matches its recorded sha256", async () => {
    const catalog = await loadCatalog();
    expect(catalog.vendored.length).toBeGreaterThan(0);
    for (const v of catalog.vendored) {
      const file = Bun.file(`${repoRoot()}${v.path}`);
      expect(await file.exists(), `${v.path}: inventory row has no file on disk`).toBe(true);
      const actual = await sha256Hex(await file.text());
      expect(actual, `${v.path}: sha256 mismatch (file edited without updating catalog.yaml, or vice versa)`).toBe(v.sha256);
    }
  });

  test("no file under skills/ is missing from the inventory (no unmaintained bytes)", async () => {
    const catalog = await loadCatalog();
    const inventory = new Set(catalog.vendored.map((v) => v.path));
    const orphans = (await filesUnderSkills()).filter((f) => f !== REPO_OWNED_UNDER_SKILLS && !inventory.has(f));
    expect(orphans).toEqual([]);
  });

  test("the inventory covers skills, prompts, references, helper/guide files and licenses -- not just entry bodies", async () => {
    const catalog = await loadCatalog();
    const entryPaths = new Set(catalog.entries.map((e) => e.vault_path).filter(Boolean) as string[]);
    const supportRows = catalog.vendored.filter((v) => !entryPaths.has(v.path));
    // Guides, _shared framework files, reference checklists, scripts, examples and licenses
    // are maintained bytes with no catalog row of their own; they must still be inventoried.
    expect(supportRows.length).toBeGreaterThan(0);
    expect(supportRows.some((v) => /\/LICENSE(\.txt)?$/.test(v.path))).toBe(true);
    expect(supportRows.some((v) => v.path.includes("/references/"))).toBe(true);
    expect(supportRows.some((v) => v.path.includes("/_shared/"))).toBe(true);
    expect(supportRows.some((v) => v.path.includes("/scripts/"))).toBe(true);
  });

  test("acceptance-critical ids resolve to a real local file: mattpocock:grilling and brooks:brooks-test", async () => {
    const catalog = await loadCatalog();
    for (const id of ["mattpocock:grilling", "brooks:brooks-test"]) {
      const entry = catalog.entries.find((e) => e.id === id)!;
      expect(entry, id).toBeTruthy();
      expect(entry.vault_path, id).toBeTruthy();
      expect(await Bun.file(`${repoRoot()}${entry.vault_path}`).exists(), id).toBe(true);
    }
  });

  test("acceptance-critical negative cases never resolve to a local file: a book row, a gstack host-generated row, a team-only row, a restricted row", async () => {
    const catalog = await loadCatalog();
    const negatives = [
      "books:a-philosophy-of-software-design", // derived-unreviewed -> catalog
      "gstack:office-hours", // host-generated -> catalog
      "pstack:arena", // team-only
      "gstack:cso", // restricted
    ];
    for (const id of negatives) {
      const entry = catalog.entries.find((e) => e.id === id)!;
      expect(entry, id).toBeTruthy();
      expect(entry.vault_path, id).toBeNull();
    }
  });
});

describe("license/notice preservation", () => {
  test("every source with vendored bytes has its own LICENSE inventoried alongside them", async () => {
    const catalog = await loadCatalog();
    const vendoredSourceIds = new Set(catalog.vendored.filter((v) => v.path.startsWith("skills/upstream/")).map((v) => v.source));
    expect(vendoredSourceIds.size).toBeGreaterThan(0);
    const inventory = new Set(catalog.vendored.map((v) => v.path));
    for (const sid of vendoredSourceIds) {
      const hasLicense = [...inventory].some((p) => p.startsWith(`skills/upstream/${sid}/`) && /\/LICENSE(\.txt)?$/.test(p));
      expect(hasLicense, `source ${sid}: no LICENSE/LICENSE.txt inventoried under skills/upstream/${sid}/`).toBe(true);
    }
  });

  test("an adaptation's source keeps its upstream license vendored too", async () => {
    const catalog = await loadCatalog();
    const inventory = new Set(catalog.vendored.map((v) => v.path));
    for (const v of catalog.vendored.filter((x) => x.path.startsWith("skills/adapted/"))) {
      const hasLicense = [...inventory].some((p) => p.startsWith(`skills/upstream/${v.source}/`) && /\/LICENSE(\.txt)?$/.test(p));
      expect(hasLicense, `${v.path}: derived from ${v.source} but that source's LICENSE is not vendored`).toBe(true);
    }
  });
});

describe("entry notes disclose what is, and is not, vendored", () => {
  test("every reference-only Brooks row names the project-mutating steps a reader must skip", async () => {
    const catalog = await loadCatalog();
    const brooks = catalog.entries.filter((e) => e.source === "hyhmrright-brooks-lint" && e.status === "reference-only");
    expect(brooks.length).toBeGreaterThan(0);
    for (const e of brooks) {
      // Their shared _shared/common.md really does tell the reader to read .brooks-lint.yaml,
      // append to .brooks-lint-history.json and write suppressions. A note calling these
      // skills plainly "read-only" would be false; each must name what to skip instead.
      expect(e.notes, `${e.id}: notes must name the config/history/suppression steps to skip`).toContain(".brooks-lint-history.json");
      expect(e.notes, `${e.id}: notes must name the config file it would otherwise write`).toContain(".brooks-lint.yaml");
      expect(e.notes.toLowerCase(), `${e.id}: notes must tell the reader to skip them`).toMatch(/skip/);
      expect(e.notes, `${e.id}: "read-only report generator" is not true of the upstream body`).not.toContain("read-only report generator");
    }
  });

  test("a partially vendored skill is not selectable, and its note discloses exactly what is local", async () => {
    const catalog = await loadCatalog();
    const entry = catalog.entries.find((e) => e.id === "discovery:supabase-postgres-best-practices")!;
    const inventory = catalog.vendored.filter((v) => v.path.includes("supabase-postgres-best-practices/references/"));
    // The body is an index over a 34-file rule set; only these are vendored.
    expect(inventory.length).toBeGreaterThan(0);
    expect(entry.status, "an index over mostly-unvendored rules must not be a worker pick").toBe("reference-only");
    for (const v of inventory) {
      const name = v.path.split("/").pop()!;
      expect(entry.notes, `notes must name the vendored rule file ${name}`).toContain(name);
    }
    expect(entry.notes, "notes must disclose how much of the upstream rule set is absent").toMatch(/34/);
  });
});

describe("generated artifacts: none remain, and nothing claims they do", () => {
  test("the removed generated files (catalog.compact.tsv, sources.lock) are not reintroduced", async () => {
    for (const path of ["catalog.compact.tsv", "sources.lock"]) {
      expect(await Bun.file(`${repoRoot()}${path}`).exists(), `${path} came back; catalog.yaml is the only authority`).toBe(false);
    }
  });

  test("no tool or doc still treats a generator or its output as live", async () => {
    const glob = new Glob("**/*.{md,ts,yaml}");
    const scanned: string[] = [];
    const offenders: string[] = [];
    for await (const file of glob.scan({ cwd: repoRoot(), onlyFiles: true })) {
      if (file.startsWith("skills/") || file.startsWith("node_modules/")) continue; // vendored text, not ours
      if (file === "tests/local-integrity.test.ts") continue; // names them on purpose, in the test above
      scanned.push(file);
      const text = await Bun.file(`${repoRoot()}${file}`).text();
      // The generator is gone: nothing may reference it at all. The two artifact names may
      // still appear in README.md, which records that they were removed and why.
      if (text.includes("bin/render.ts")) offenders.push(`${file}: references the deleted generator`);
      if (file !== "README.md" && /catalog\.compact\.tsv|sources\.lock/.test(text)) {
        offenders.push(`${file}: still treats a generated artifact as live`);
      }
    }
    expect(scanned).toContain("README.md"); // the scan really reaches the docs
    expect(scanned).toContain("catalog.yaml");
    expect(offenders).toEqual([]);
  });
});

describe("pin integrity vs. live upstream (network-optional; a reachable 404 is a failure, not a skip)", () => {
  test(
    "every skills/upstream/ inventory row is byte-identical to the live commit it claims to be pinned at",
    async () => {
      const catalog = await loadCatalog();
      const rows = catalog.vendored.filter((v) => v.path.startsWith("skills/upstream/"));
      expect(rows.length).toBeGreaterThan(0);

      const results = await Promise.all(
        rows.map(async (v) => {
          const source = catalog.sources[v.source];
          const result = await fetchRawOrSkip(source.repo, source.sha, v.upstream_path!);
          return { v, result };
        }),
      );

      let verified = 0;
      let unreachable = 0;
      for (const { v, result } of results) {
        if (!result.reachable) {
          unreachable++;
          continue;
        }
        // We got a response: a non-200 here means the pin is stale/broken, a real failure.
        expect(result.res.ok, `${v.path}: pinned commit no longer serves ${v.upstream_path} (HTTP ${result.res.status}) -- pin is stale or the path moved`).toBe(true);
        const liveHash = await sha256Hex(await result.res.text());
        expect(liveHash, `${v.path}: locally vendored content no longer matches the live pinned commit`).toBe(v.sha256);
        verified++;
      }

      if (unreachable === rows.length) {
        console.warn(`pin integrity check: network unreachable for all ${unreachable} rows -- skipped, not failed.`);
      } else {
        console.log(`pin integrity check: verified ${verified}/${rows.length} vendored files byte-identical to their live pinned commit (${unreachable} unreachable).`);
      }
    },
    60000,
  );
});
