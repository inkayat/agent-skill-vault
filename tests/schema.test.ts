import { describe, expect, test } from "bun:test";
import { validateCatalog, type Catalog, type Entry, type Source, type VendoredFile } from "../bin/lib/catalog.ts";
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
    notes: "",
    ...overrides,
  };
}

/** A minimal, schema-valid firstmate_candidate entry (vault_path backed by an inventory row). */
function candidateEntry(overrides: Partial<Entry> = {}): Entry {
  return baseEntry({
    status: "firstmate_candidate",
    activation: "explicit",
    vault_path: "skills/upstream/test-source/skills/test/SKILL.md",
    ...overrides,
  });
}

function vendoredRow(overrides: Partial<VendoredFile> = {}): VendoredFile {
  return {
    path: "skills/upstream/test-source/skills/test/SKILL.md",
    source: "test-source",
    upstream_path: "skills/test/SKILL.md",
    sha256: "b".repeat(64),
    ...overrides,
  };
}

function baseCatalog(
  entries: Entry[],
  sources: Record<string, Source> = { "test-source": baseSource() },
  vendored: VendoredFile[] = [vendoredRow(), vendoredRow({ path: "skills/upstream/test-source/x.md", upstream_path: "x.md" })],
): Catalog {
  return { version: 1, sources, entries, vendored };
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
      const ok = baseCatalog([candidateEntry({ activation })]);
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

describe("validateCatalog: notes field", () => {
  test("rejects an entry whose notes is not a string", () => {
    const invalidNotesValues: unknown[] = [123, null, undefined, true, ["a"], { a: 1 }];
    for (const notes of invalidNotesValues) {
      const bad = baseCatalog([baseEntry({ notes: notes as unknown as string })]);
      const errors = validateCatalog(bad);
      expect(errors.some((e) => e.includes("notes must be a string") && e.includes("use empty string for none"))).toBe(true);
    }
  });

  test("accepts an entry with empty string notes", () => {
    const ok = baseCatalog([candidateEntry({ notes: "" })]);
    expect(validateCatalog(ok)).toEqual([]);
  });
});

describe("validateCatalog: content-model invariants (vault_path bound to the vendored inventory)", () => {
  test("rejects a firstmate_candidate with no vault_path", () => {
    const bad = baseCatalog([candidateEntry({ vault_path: null })]);
    expect(validateCatalog(bad).some((e) => e.includes("requires a real local vault_path"))).toBe(true);
  });

  test("rejects a firstmate_candidate whose vault_path escapes skills/upstream or skills/adapted", () => {
    const bad = baseCatalog([candidateEntry({ vault_path: "somewhere/else/SKILL.md" })]);
    expect(validateCatalog(bad).some((e) => e.includes("must stay under skills/upstream/ or skills/adapted/"))).toBe(true);
  });

  test("rejects a vault_path that traverses out of the repo with ..", () => {
    const bad = baseCatalog([candidateEntry({ vault_path: "skills/upstream/../../etc/passwd" })]);
    expect(validateCatalog(bad).some((e) => e.includes("no traversal"))).toBe(true);
  });

  test("accepts a firstmate_candidate vault_path under skills/adapted/ when the inventory carries it", () => {
    const ok = baseCatalog(
      [candidateEntry({ vault_path: "skills/adapted/x/SKILL.md" })],
      { "test-source": baseSource() },
      [vendoredRow({ path: "skills/adapted/x/SKILL.md", upstream_path: null })],
    );
    expect(validateCatalog(ok)).toEqual([]);
  });

  test("rejects a vault_path with no row in the vendored inventory (the file would be unmaintained)", () => {
    const bad = baseCatalog([candidateEntry({ vault_path: "skills/upstream/test-source/skills/other/SKILL.md" })]);
    expect(validateCatalog(bad).some((e) => e.includes("has no row in the vendored inventory"))).toBe(true);
  });

  test("rejects a vault_path that does not mirror its own source and upstream_path", () => {
    const bad = baseCatalog(
      [candidateEntry({ vault_path: "skills/upstream/test-source/x.md" })],
      { "test-source": baseSource() },
      [vendoredRow({ path: "skills/upstream/test-source/x.md", upstream_path: "x.md" })],
    );
    expect(validateCatalog(bad).some((e) => e.includes("must mirror its own source+upstream_path"))).toBe(true);
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

  test("accepts a reference-only entry whose vault_path is an inventory row", () => {
    const ok = baseCatalog([
      baseEntry({ status: "reference-only", activation: "never", upstream_path: "x.md", vault_path: "skills/upstream/test-source/x.md" }),
    ]);
    expect(validateCatalog(ok)).toEqual([]);
  });
});

describe("validateCatalog: the vendored inventory itself", () => {
  test("rejects a missing inventory", () => {
    const bad = { version: 1, sources: { "test-source": baseSource() }, entries: [] } as unknown as Catalog;
    expect(validateCatalog(bad).some((e) => e.includes("missing authoritative vendored-file inventory"))).toBe(true);
  });

  test("rejects a duplicate inventory row (two hashes could disagree for one file)", () => {
    const bad = baseCatalog([], { "test-source": baseSource() }, [vendoredRow(), vendoredRow({ sha256: "c".repeat(64) })]);
    expect(validateCatalog(bad).some((e) => e.includes("duplicate inventory row"))).toBe(true);
  });

  test("rejects an inventory path outside skills/, or one that traverses out of the repo", () => {
    for (const path of ["/etc/passwd", "../outside.md", "skills/upstream/test-source/../../../outside.md"]) {
      const bad = baseCatalog([], { "test-source": baseSource() }, [vendoredRow({ path })]);
      expect(validateCatalog(bad).some((e) => e.includes("path must stay under")), path).toBe(true);
    }
  });

  test("rejects an upstream row whose path does not equal skills/upstream/<source>/<upstream_path>", () => {
    const bad = baseCatalog([], { "test-source": baseSource() }, [vendoredRow({ upstream_path: "skills/elsewhere/SKILL.md" })]);
    expect(validateCatalog(bad).some((e) => e.includes("path must equal"))).toBe(true);
  });

  test("rejects an upstream row with no upstream_path, and an adapted row that claims one", () => {
    const noPath = baseCatalog([], { "test-source": baseSource() }, [vendoredRow({ upstream_path: null })]);
    expect(validateCatalog(noPath).some((e) => e.includes("requires upstream_path"))).toBe(true);
    const adapted = baseCatalog([], { "test-source": baseSource() }, [vendoredRow({ path: "skills/adapted/x/SKILL.md", upstream_path: "skills/test/SKILL.md" })]);
    expect(validateCatalog(adapted).some((e) => e.includes("must set upstream_path: null"))).toBe(true);
  });

  test("rejects an inventory row pointing at an unknown source, or carrying a malformed hash", () => {
    const unknown = baseCatalog([], { "test-source": baseSource() }, [vendoredRow({ path: "skills/upstream/ghost/x.md", source: "ghost", upstream_path: "x.md" })]);
    expect(validateCatalog(unknown).some((e) => e.includes("unknown source ghost"))).toBe(true);
    const badHash = baseCatalog([], { "test-source": baseSource() }, [vendoredRow({ sha256: "nope" })]);
    expect(validateCatalog(badHash).some((e) => e.includes("sha256 is not 64 hex chars"))).toBe(true);
  });
});

describe("real catalog: every firstmate_candidate and reference-only entry resolves to an inventoried file", () => {
  test("every firstmate_candidate entry resolves to skills/upstream/ or skills/adapted/", async () => {
    const catalog = await loadCatalog();
    const inventory = new Set(catalog.vendored.map((v) => v.path));
    const candidates = catalog.entries.filter((e) => e.status === "firstmate_candidate");
    expect(candidates.length).toBeGreaterThan(0);
    for (const e of candidates) {
      expect(e.vault_path, e.id).toBeTruthy();
      expect(inventory.has(e.vault_path!), `${e.id}: ${e.vault_path} is not in the vendored inventory`).toBe(true);
    }
  });

  test("every reference-only entry also resolves to a real vault_path (explicit-id/captain reference only)", async () => {
    const catalog = await loadCatalog();
    const inventory = new Set(catalog.vendored.map((v) => v.path));
    const refOnly = catalog.entries.filter((e) => e.status === "reference-only");
    expect(refOnly.length).toBeGreaterThan(0);
    for (const e of refOnly) {
      expect(e.vault_path, e.id).toBeTruthy();
      expect(inventory.has(e.vault_path!), `${e.id}: ${e.vault_path} is not in the vendored inventory`).toBe(true);
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
