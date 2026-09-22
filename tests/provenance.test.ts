import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { validateCatalog, type Catalog, type Source } from "../bin/lib/catalog.ts";
import { loadCatalog, repoRoot } from "./helpers.ts";

const SHA_RE = /^[0-9a-f]{40}$/;

function baseSource(overrides: Partial<Source> = {}): Source {
  return {
    repo: "owner/repo",
    sha: "a".repeat(40),
    license: "MIT",
    license_evidence: "https://example.com/LICENSE",
    origin: "canonical",
    rights: "clear",
    pinned: true,
    ...overrides,
  };
}

describe("catalog.yaml provenance (real)", () => {
  test("every source declares license, license_evidence, origin, and rights", async () => {
    const catalog = await loadCatalog();
    for (const [id, s] of Object.entries(catalog.sources)) {
      expect(s.license, `${id}.license`).toBeTruthy();
      expect(s.license_evidence, `${id}.license_evidence`).toBeTruthy();
      expect(["canonical", "mirror"]).toContain(s.origin);
      expect(["clear", "derived-unreviewed", "unclear"]).toContain(s.rights);
    }
  });

  test("every pinned source has an exact 40-hex commit SHA (no branches)", async () => {
    const catalog = await loadCatalog();
    for (const [id, s] of Object.entries(catalog.sources)) {
      if (s.pinned) expect(s.sha, id).toMatch(SHA_RE);
    }
  });

  test("license_evidence URLs are pinned at the source's own sha, not a branch", async () => {
    const catalog = await loadCatalog();
    for (const [id, s] of Object.entries(catalog.sources)) {
      if (!s.pinned) continue;
      if (s.license_evidence.startsWith("https://github.com/") || s.license_evidence.startsWith("https://raw.githubusercontent.com/")) {
        expect(s.license_evidence, id).toContain(s.sha);
      }
    }
  });

  test("unclear rights are never pinned (metadata-only per the captain's rule)", async () => {
    const catalog = await loadCatalog();
    for (const [id, s] of Object.entries(catalog.sources)) {
      if (s.rights === "unclear") expect(s.pinned, id).toBe(false);
    }
  });

  test("every firstmate_candidate entry has a non-empty notes field", async () => {
    const catalog = await loadCatalog();
    const uninformative = catalog.entries.filter((e) => e.status === "firstmate_candidate" && e.notes.trim() === "");
    expect(uninformative.map((e) => e.id)).toEqual([]);
  });

  test("pstack and Thermos are separate source records with distinct license evidence, despite sharing a repo/commit", async () => {
    const catalog = await loadCatalog();
    const pstack = catalog.sources["cursor-plugins-pstack"];
    const thermos = catalog.sources["cursor-plugins-thermos"];
    expect(pstack, "cursor-plugins-pstack").toBeTruthy();
    expect(thermos, "cursor-plugins-thermos").toBeTruthy();
    // Same monorepo commit...
    expect(pstack.repo).toBe(thermos.repo);
    expect(pstack.sha).toBe(thermos.sha);
    // ...but each plugin's own LICENSE file, never one standing in for the other.
    expect(pstack.license_evidence).not.toBe(thermos.license_evidence);
    expect(pstack.license_evidence).toContain("/pstack/LICENSE");
    expect(thermos.license_evidence).toContain("/thermos/LICENSE");
    expect(pstack.license).not.toBe(thermos.license); // distinct copyright holders (Lauren Tan vs Cursor)
  });

  test("no pstack entry is sourced from cursor-plugins-thermos and vice versa", async () => {
    const catalog = await loadCatalog();
    for (const e of catalog.entries) {
      if (e.id.startsWith("pstack:")) expect(e.source, e.id).toBe("cursor-plugins-pstack");
      if (e.id.startsWith("thermos:")) expect(e.source, e.id).toBe("cursor-plugins-thermos");
    }
  });

  test("every source with vendored bytes is pinned at an exact commit, and every inventory row names a real source", async () => {
    const catalog = await loadCatalog();
    // The vendored inventory is the single pin authority: this asserts its integrity instead
    // of restating each repo/sha here, which was a second copy to update on every pin bump.
    const vendoredSources = new Set(catalog.vendored.map((v) => v.source));
    expect(vendoredSources.size).toBeGreaterThan(0);
    for (const sid of vendoredSources) {
      const source = catalog.sources[sid];
      expect(source, `inventory references unknown source ${sid}`).toBeTruthy();
      expect(source.pinned, `${sid} has vendored bytes but is not pinned`).toBe(true);
      expect(source.sha, sid).toMatch(SHA_RE);
      expect(source.rights, `${sid} has vendored bytes, so its rights must be clear`).toBe("clear");
    }
  });

  test("no test or generated file holds a second copy of a pin (catalog.yaml is the only authority)", async () => {
    const catalog = await loadCatalog();
    const shas = new Set(Object.values(catalog.sources).filter((s) => s.pinned).map((s) => s.sha));
    const glob = new Glob("tests/**/*.ts");
    for await (const file of glob.scan({ cwd: repoRoot(), onlyFiles: true })) {
      const text = await Bun.file(`${repoRoot()}${file}`).text();
      for (const sha of shas) {
        expect(text.includes(sha), `${file} hardcodes the pin ${sha}; read it from catalog.yaml instead`).toBe(false);
      }
    }
  });

  test("validateCatalog rejects rights=unclear paired with pinned=true", () => {
    const bad: Catalog = {
      version: 1,
      sources: { s: baseSource({ rights: "unclear", pinned: true }) },
      entries: [],
      vendored: [],
    };
    expect(validateCatalog(bad).some((e) => e.includes("metadata-only"))).toBe(true);
  });

  test("validateCatalog rejects a pinned source with a malformed sha", () => {
    const bad: Catalog = {
      version: 1,
      sources: { s: baseSource({ sha: "not-a-sha" }) },
      entries: [],
      vendored: [],
    };
    expect(validateCatalog(bad).some((e) => e.includes("not 40 hex"))).toBe(true);
  });
});
