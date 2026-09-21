import { describe, expect, test } from "bun:test";
import { validateCatalog, type Catalog, type Entry, type Source } from "../bin/lib/catalog.ts";
import { loadCatalog } from "./helpers.ts";

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

function baseEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "test:entry",
    source: "test-source",
    upstream_path: "skills/test/SKILL.md",
    vault_path: null,
    status: "reference-only",
    activation: "never",
    scope: "worker",
    categories: [],
    cluster: "implement",
    favorite: false,
    notes: "",
    ...overrides,
  };
}

/** A minimal, schema-valid firstmate_candidate entry (has vault_path + content_sha256). */
function candidateEntry(overrides: Partial<Entry> = {}): Entry {
  return baseEntry({
    status: "firstmate_candidate",
    activation: "explicit",
    vault_path: "skills/upstream/test-source/skills/test/SKILL.md",
    content_sha256: "b".repeat(64),
    ...overrides,
  });
}

function baseCatalog(entries: Entry[], sources: Record<string, Source> = { "test-source": baseSource() }): Catalog {
  return { version: 1, sources, entries };
}

describe("catalog.yaml (real)", () => {
  test("validates with zero schema errors", async () => {
    const catalog = await loadCatalog();
    expect(validateCatalog(catalog)).toEqual([]);
  });

  test("has at least one entry per known status", async () => {
    const catalog = await loadCatalog();
    const statuses = new Set(catalog.entries.map((e) => e.status));
    for (const s of ["installed", "firstmate_candidate", "reference-only", "catalog", "team-only", "restricted"]) {
      expect(statuses.has(s)).toBe(true);
    }
  });
});

describe("validateCatalog: enumeration and invariants", () => {
  test("rejects an unknown status", () => {
    const bad = baseCatalog([baseEntry({ status: "bogus" as Entry["status"] })]);
    expect(validateCatalog(bad).some((e) => e.includes("bad status"))).toBe(true);
  });

  test("rejects an unknown activation", () => {
    const bad = baseCatalog([baseEntry({ activation: "bogus" as Entry["activation"] })]);
    expect(validateCatalog(bad).some((e) => e.includes("bad activation"))).toBe(true);
  });

  test("rejects an unknown scope", () => {
    const bad = baseCatalog([baseEntry({ scope: "bogus" as Entry["scope"] })]);
    expect(validateCatalog(bad).some((e) => e.includes("bad scope"))).toBe(true);
  });

  test("rejects firstmate_candidate with activation=never", () => {
    const bad = baseCatalog([candidateEntry({ activation: "never" })]);
    expect(validateCatalog(bad).some((e) => e.includes("requires activation in"))).toBe(true);
  });

  test("rejects a non-candidate status with activation != never", () => {
    for (const status of ["reference-only", "catalog", "team-only", "restricted"] as const) {
      const bad = baseCatalog([baseEntry({ status, activation: "explicit" })]);
      expect(validateCatalog(bad).some((e) => e.includes("requires activation=never"))).toBe(true);
    }
  });

  test("accepts firstmate_candidate with auto-candidate or explicit", () => {
    for (const activation of ["auto-candidate", "explicit"] as const) {
      const ok = baseCatalog([candidateEntry({ activation, size_bytes: activation === "auto-candidate" ? 100 : undefined })]);
      expect(validateCatalog(ok)).toEqual([]);
    }
  });

  test("rejects installed status without installed_as", () => {
    const bad = baseCatalog([baseEntry({ status: "installed", activation: "never" })]);
    expect(validateCatalog(bad).some((e) => e.includes("requires installed_as"))).toBe(true);
  });

  test("rejects installed_as set on a non-installed entry", () => {
    const bad = baseCatalog([baseEntry({ installed_as: "foo" })]);
    expect(validateCatalog(bad).some((e) => e.includes("installed_as set but status"))).toBe(true);
  });

  test("rejects a reference to an unknown source", () => {
    const bad = baseCatalog([baseEntry({ source: "nonexistent" })]);
    expect(validateCatalog(bad).some((e) => e.includes("unknown source"))).toBe(true);
  });

  test("rejects a duplicate id", () => {
    const bad = baseCatalog([baseEntry({ id: "dup:a" }), baseEntry({ id: "dup:a" })]);
    expect(validateCatalog(bad).some((e) => e.includes("duplicate id"))).toBe(true);
  });
});

describe("validateCatalog: content-model invariants (vault_path / content_sha256)", () => {
  test("rejects a firstmate_candidate with no vault_path", () => {
    const bad = baseCatalog([candidateEntry({ vault_path: null })]);
    expect(validateCatalog(bad).some((e) => e.includes("requires a real local vault_path"))).toBe(true);
  });

  test("rejects a firstmate_candidate whose vault_path escapes skills/upstream or skills/adapted", () => {
    const bad = baseCatalog([candidateEntry({ vault_path: "somewhere/else/SKILL.md" })]);
    expect(validateCatalog(bad).some((e) => e.includes("must live under skills/upstream/ or skills/adapted/"))).toBe(true);
  });

  test("accepts a firstmate_candidate vault_path under skills/adapted/", () => {
    const ok = baseCatalog([candidateEntry({ vault_path: "skills/adapted/x/SKILL.md" })]);
    expect(validateCatalog(ok)).toEqual([]);
  });

  test("rejects a firstmate_candidate with no content_sha256", () => {
    const bad = baseCatalog([candidateEntry({ content_sha256: undefined })]);
    expect(validateCatalog(bad).some((e) => e.includes("requires content_sha256"))).toBe(true);
  });

  test("rejects a malformed content_sha256", () => {
    const bad = baseCatalog([candidateEntry({ content_sha256: "not-a-hash" })]);
    expect(validateCatalog(bad).some((e) => e.includes("not 64 hex chars"))).toBe(true);
  });

  test("rejects a catalog/team-only/restricted entry that carries a vault_path", () => {
    for (const status of ["catalog", "team-only", "restricted"] as const) {
      const bad = baseCatalog([baseEntry({ status, activation: "never", vault_path: "skills/upstream/test-source/x.md" })]);
      expect(validateCatalog(bad).some((e) => e.includes("must not carry a vault_path"))).toBe(true);
    }
  });

  test("rejects a reference-only entry with no vault_path", () => {
    const bad = baseCatalog([baseEntry({ status: "reference-only", activation: "never", vault_path: null })]);
    expect(validateCatalog(bad).some((e) => e.includes("requires a real local vault_path"))).toBe(true);
  });

  test("accepts a reference-only entry with a real vault_path + content_sha256", () => {
    const ok = baseCatalog([
      baseEntry({ status: "reference-only", activation: "never", vault_path: "skills/upstream/test-source/x.md", content_sha256: "c".repeat(64) }),
    ]);
    expect(validateCatalog(ok)).toEqual([]);
  });
});

describe("real catalog: every firstmate_candidate and reference-only entry has a real vault_path and content_sha256", () => {
  test("all 48 firstmate_candidate entries resolve to skills/upstream/ or skills/adapted/", async () => {
    const catalog = await loadCatalog();
    const candidates = catalog.entries.filter((e) => e.status === "firstmate_candidate");
    expect(candidates.length).toBe(48);
    for (const e of candidates) {
      expect(e.vault_path, e.id).toBeTruthy();
      expect(e.vault_path!.startsWith("skills/upstream/") || e.vault_path!.startsWith("skills/adapted/"), e.id).toBe(true);
      expect(e.content_sha256, e.id).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("all 21 reference-only entries also resolve to a real vault_path (explicit-id/captain reference only)", async () => {
    const catalog = await loadCatalog();
    const refOnly = catalog.entries.filter((e) => e.status === "reference-only");
    expect(refOnly.length).toBe(21);
    for (const e of refOnly) {
      expect(e.vault_path, e.id).toBeTruthy();
      expect(e.vault_path!.startsWith("skills/upstream/") || e.vault_path!.startsWith("skills/adapted/"), e.id).toBe(true);
      expect(e.content_sha256, e.id).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("no installed/catalog/team-only/restricted entry carries a vault_path", async () => {
    const catalog = await loadCatalog();
    const metadataOnly = catalog.entries.filter((e) => !["firstmate_candidate", "reference-only"].includes(e.status));
    expect(metadataOnly.length).toBeGreaterThan(0);
    for (const e of metadataOnly) {
      expect(e.vault_path, e.id).toBeNull();
    }
  });
});
