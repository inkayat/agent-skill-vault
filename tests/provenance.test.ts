import { describe, expect, test } from "bun:test";
import { validateCatalog, type Catalog, type Source } from "../bin/lib/catalog.ts";
import { loadCatalog } from "./helpers.ts";

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

  test("known sources carry the expected exact repo and sha (spot-check against audited evidence)", async () => {
    const catalog = await loadCatalog();
    const expected: Record<string, { repo: string; sha: string }> = {
      "cursor-plugins-pstack": { repo: "cursor/plugins", sha: "6ed0f7a9504f577d7529064103cecce9be7dfc5e" },
      "cursor-plugins-thermos": { repo: "cursor/plugins", sha: "6ed0f7a9504f577d7529064103cecce9be7dfc5e" },
      "garrytan-gstack": { repo: "garrytan/gstack", sha: "a6b3a57512ca6d5c6aa5b68f74f736195021f96e" },
      "hyhmrright-brooks-lint": { repo: "hyhmrright/brooks-lint", sha: "220fe716c01950966e961e020eda9c457f4dd0a7" },
      "obra-superpowers": { repo: "obra/superpowers", sha: "5bf4e78011075bcfc0dc295f0724994cd123ee71" },
      "addyosmani-agent-skills": { repo: "addyosmani/agent-skills", sha: "dc27a9c2e13721158157632de61b4106c6c2a2a1" },
      "ciembor-agent-rules-books": { repo: "ciembor/agent-rules-books", sha: "893a88a6fce3a80c565bf39ac65021b43a8b2990" },
      "anthropics-skills": { repo: "anthropics/skills", sha: "34040c9c568585f6929bedeaad110ad08f079624" },
      "mattpocock-skills": { repo: "mattpocock/skills", sha: "c55ee46073ed923f86ce59a5eb3b6d895095d1b7" },
      "supabase-agent-skills": { repo: "supabase/agent-skills", sha: "8331f910845103c08d51f6ca1d86ebb7d1f745e3" },
    };
    for (const [id, want] of Object.entries(expected)) {
      const got = catalog.sources[id];
      expect(got, id).toBeTruthy();
      expect(got.repo, id).toBe(want.repo);
      expect(got.sha, id).toBe(want.sha);
    }
  });

  test("validateCatalog rejects rights=unclear paired with pinned=true", () => {
    const bad: Catalog = {
      version: 1,
      sources: { s: baseSource({ rights: "unclear", pinned: true }) },
      entries: [],
    };
    expect(validateCatalog(bad).some((e) => e.includes("metadata-only"))).toBe(true);
  });

  test("validateCatalog rejects a pinned source with a malformed sha", () => {
    const bad: Catalog = {
      version: 1,
      sources: { s: baseSource({ sha: "not-a-sha" }) },
      entries: [],
    };
    expect(validateCatalog(bad).some((e) => e.includes("not 40 hex"))).toBe(true);
  });
});
