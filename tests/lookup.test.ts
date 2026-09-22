import { describe, expect, test } from "bun:test";
import { cachePath, escapeTsvField, lookupByCategory, lookupById, renderIdRow, renderRow, type Catalog, type Entry, type Source } from "../bin/lib/catalog.ts";
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
    for (const id of ["mattpocock:grilling", "superpowers:requesting-code-review"]) {
      const entry = lookupById(catalog, id);
      expect(entry?.status, id).toBe("reference-only");
      const path = cachePath(entry!);
      expect(path, id).toBeTruthy();
      expect(path, id).toMatch(/^skills\/upstream\//);
    }
  });

  test("returns the adapted body for brooks:brooks-test, the explicit test-quality specialist", async () => {
    const catalog = await loadCatalog();
    const entry = lookupById(catalog, "brooks:brooks-test");
    expect(entry?.status).toBe("firstmate_candidate");
    expect(entry?.activation).toBe("explicit");
    expect(cachePath(entry!)).toBe("skills/adapted/brooks/brooks-test/SKILL.md");
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
          status: "reference-only", activation: "never", scope: "worker",
          categories: ["REVIEW"], cluster: "review", notes: "decoy",
        },
        {
          id: "cand:real", source: "s", upstream_path: "y.md", vault_path: "skills/upstream/s/y.md",
          status: "firstmate_candidate", activation: "auto-candidate", scope: "worker",
          categories: ["REVIEW"], cluster: "review", notes: "real",
        },
      ],
      vendored: [
        { path: "skills/upstream/s/x.md", source: "s", upstream_path: "x.md", sha256: "b".repeat(64) },
        { path: "skills/upstream/s/y.md", source: "s", upstream_path: "y.md", sha256: "c".repeat(64) },
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

describe("escapeTsvField", () => {
  test("passes plain punctuation through unchanged", () => {
    expect(escapeTsvField("skip the arena step; see note (v2)!")).toBe("skip the arena step; see note (v2)!");
  });

  test("backslash-escapes literal tabs so they can never introduce a column boundary", () => {
    expect(escapeTsvField("a\tb")).toBe("a\\tb");
  });

  test("backslash-escapes literal newlines (LF and CRLF) so they can never introduce a row boundary", () => {
    expect(escapeTsvField("a\nb")).toBe("a\\nb");
    expect(escapeTsvField("a\r\nb")).toBe("a\\nb");
  });

  test("escapes a literal backslash first, so escaped sequences stay unambiguous", () => {
    expect(escapeTsvField("a\\tb")).toBe("a\\\\tb");
  });
});

describe("renderIdRow (--id notes column)", () => {
  function noteEntry(overrides: Partial<Entry> = {}): Entry {
    return {
      id: "test:entry",
      source: "test-source",
      upstream_path: "skills/test/SKILL.md",
      vault_path: "skills/upstream/test-source/skills/test/SKILL.md",
      status: "firstmate_candidate",
      activation: "explicit",
      scope: "worker",
      categories: ["IMPLEMENT"],
      cluster: "implement",
      notes: "",
      ...overrides,
    };
  }

  test("pstack:blast-radius exposes its adaptation caveat as the final field", async () => {
    const catalog = await loadCatalog();
    const entry = lookupById(catalog, "pstack:blast-radius")!;
    const columns = renderIdRow(entry).split("\t");
    expect(columns.length).toBe(9);
    expect(columns[8]).toContain("self-contained adaptation");
  });

  test("brooks:brooks-test exposes its adaptation caveat as the final field", async () => {
    const catalog = await loadCatalog();
    const entry = lookupById(catalog, "brooks:brooks-test")!;
    const columns = renderIdRow(entry).split("\t");
    expect(columns.length).toBe(9);
    expect(columns[8]).toContain("FirstMate-safe adaptation");
  });

  test("the first 8 columns are byte-identical to the base row (no shift, no duplication)", async () => {
    const catalog = await loadCatalog();
    const entry = lookupById(catalog, "pstack:blast-radius")!;
    const idColumns = renderIdRow(entry).split("\t");
    const baseColumns = renderRow(entry).split("\t");
    expect(idColumns.slice(0, 8)).toEqual(baseColumns);
  });

  test("a row with punctuation, tabs, and newlines in notes stays exactly one TSV row", () => {
    const entry = noteEntry({ notes: "quote \" comma, semicolon; tab\tnewline\nend" });
    const rendered = renderIdRow(entry);
    expect(rendered.split("\n").length).toBe(1);
    expect(rendered.split("\t").length).toBe(9);
  });

  test("a row without notes emits an unambiguous empty final field", () => {
    const entry = noteEntry({ notes: "" });
    const columns = renderIdRow(entry).split("\t");
    expect(columns.length).toBe(9);
    expect(columns[8]).toBe("");
  });
});

describe("renderRow (category shortlist shape, byte-compatible with the prior 8-column contract)", () => {
  test("every real category row stays exactly 8 columns, no notes column leaks in", async () => {
    const catalog = await loadCatalog();
    for (const entry of lookupByCategory(catalog, "REVIEW")) {
      expect(renderRow(entry).split("\t").length, entry.id).toBe(8);
    }
  });
});
