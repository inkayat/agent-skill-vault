import { describe, expect, test } from "bun:test";
import { cachePath, lookupByCategory, lookupById, type Catalog, type Source } from "../bin/lib/catalog.ts";
import { loadCatalog } from "./helpers.ts";

describe("explicit-id lookup", () => {
  test("returns the exact row for a known auto-candidate id", async () => {
    const catalog = await loadCatalog();
    const entry = lookupById(catalog, "pstack:blast-radius");
    expect(entry?.id).toBe("pstack:blast-radius");
    expect(entry?.status).toBe("firstmate_candidate");
  });

  test("returns the exact row for a known installed id", async () => {
    const catalog = await loadCatalog();
    const entry = lookupById(catalog, "superpowers:test-driven-development");
    expect(entry?.status).toBe("installed");
    expect(entry?.installed_as).toBe("test-driven-development");
  });

  test("returns null for a restricted id (never surfaced by id lookup)", async () => {
    const catalog = await loadCatalog();
    expect(lookupById(catalog, "gstack:cso")).toBeNull();
    expect(lookupById(catalog, "pstack:poteto-mode")).toBeNull();
  });

  test("returns null for a catalog-status id (never surfaced by id lookup)", async () => {
    const catalog = await loadCatalog();
    expect(lookupById(catalog, "discovery:agentic-awesome-skills")).toBeNull();
  });

  test("returns null for a team-only id, even on an exact match (no Team Mode)", async () => {
    const catalog = await loadCatalog();
    expect(lookupById(catalog, "pstack:arena")).toBeNull();
    expect(lookupById(catalog, "superpowers:executing-plans")).toBeNull();
  });

  test("returns null for an unknown id", async () => {
    const catalog = await loadCatalog();
    expect(lookupById(catalog, "nonexistent:id")).toBeNull();
  });

  test("returns the exact row for a reference-only id, with a real cache_path (not empty, not null)", async () => {
    const catalog = await loadCatalog();
    for (const id of ["mattpocock:grilling", "brooks:brooks-test"]) {
      const entry = lookupById(catalog, id);
      expect(entry?.status, id).toBe("reference-only");
      const path = cachePath(entry!);
      expect(path, id).toBeTruthy();
      expect(path, id).toMatch(/^skills\/upstream\//);
    }
  });
});

describe("category shortlist behavior", () => {
  test("returns zero rows for a category with no auto-candidate matches", async () => {
    const catalog = await loadCatalog();
    expect(lookupByCategory(catalog, "NO-SUCH-CATEGORY")).toEqual([]);
  });

  test("returns only firstmate_candidate/auto-candidate rows, never reference-only/catalog/team-only/restricted", async () => {
    const catalog = await loadCatalog();
    const rows = lookupByCategory(catalog, "REVIEW");
    expect(rows.length).toBeGreaterThan(0);
    for (const e of rows) {
      expect(e.status).toBe("firstmate_candidate");
      expect(e.activation).toBe("auto-candidate");
      expect(e.categories).toContain("REVIEW");
    }
  });

  test("category lookup structurally excludes reference-only even when it carries a matching category (not just a data coincidence)", () => {
    const source: Source = {
      repo: "owner/repo", sha: "a".repeat(40), license: "MIT", license_evidence: "https://example.com",
      origin: "canonical", rights: "clear", pinned: true,
    };
    const synthetic: Catalog = {
      version: 1,
      sources: { s: source },
      entries: [
        {
          id: "ref:decoy", source: "s", upstream_path: "x.md", vault_path: "skills/upstream/s/x.md",
          content_sha256: "b".repeat(64), status: "reference-only", activation: "never", scope: "worker",
          categories: ["REVIEW"], cluster: "review", favorite: false, notes: "decoy",
        },
        {
          id: "cand:real", source: "s", upstream_path: "y.md", vault_path: "skills/upstream/s/y.md",
          content_sha256: "c".repeat(64), status: "firstmate_candidate", activation: "auto-candidate", scope: "worker",
          categories: ["REVIEW"], cluster: "review", favorite: false, notes: "real", size_bytes: 100,
        },
      ],
    };
    const rows = lookupByCategory(synthetic, "REVIEW");
    expect(rows.map((e) => e.id)).toEqual(["cand:real"]);
  });

  test("returns the full shortlist, never truncated -- a category with more than 3 real matches returns all of them", async () => {
    const catalog = await loadCatalog();
    const rows = lookupByCategory(catalog, "IMPLEMENT");
    // Proves the fix: the shortlist is not silently capped at 3, hiding real
    // auto-candidates from the agent-owned selection downstream.
    expect(rows.length).toBeGreaterThan(3);
  });

  test("deterministic: repeated calls return the same rows in the same (sorted-by-id) order", async () => {
    const catalog = await loadCatalog();
    const a = lookupByCategory(catalog, "ARCHITECTURE").map((e) => e.id);
    const b = lookupByCategory(catalog, "ARCHITECTURE").map((e) => e.id);
    expect(a).toEqual(b);
    expect(a).toEqual([...a].sort((x, y) => x.localeCompare(y)));
  });

  test("every row returned by every category query is present in every field required for a brief handoff", async () => {
    const catalog = await loadCatalog();
    const allCategories = new Set(catalog.entries.flatMap((e) => e.categories));
    for (const category of allCategories) {
      for (const e of lookupByCategory(catalog, category)) {
        expect(e.vault_path, e.id).toBeTruthy();
        expect(e.notes, e.id).toBeTruthy();
      }
    }
  });
});
