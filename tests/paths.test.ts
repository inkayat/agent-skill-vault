import { describe, expect, test } from "bun:test";
import { cachePath } from "../bin/lib/catalog.ts";
import { loadCatalog } from "./helpers.ts";

describe("exact paths and commits (spot-checked against audited evidence)", () => {
  test("pstack:blast-radius resolves to the exact audited upstream path and a real local vault_path", async () => {
    const catalog = await loadCatalog();
    const entry = catalog.entries.find((e) => e.id === "pstack:blast-radius");
    expect(entry).toBeTruthy();
    expect(entry?.upstream_path).toBe("pstack/skills/blast-radius/SKILL.md");
    expect(entry?.vault_path).toBe("skills/upstream/cursor-plugins-pstack/pstack/skills/blast-radius/SKILL.md");
    expect(cachePath(entry!)).toBe(entry?.vault_path);
  });

  test("gstack:review points at the plain checklist, never the generated Agent-tool SKILL.md (metadata-only, no vault_path)", async () => {
    const catalog = await loadCatalog();
    const entry = catalog.entries.find((e) => e.id === "gstack:review");
    expect(entry?.upstream_path).toBe("review/checklist.md");
    expect(entry?.upstream_path).not.toContain("SKILL.md");
    expect(entry?.vault_path).toBeNull(); // reference-only: metadata-only, never a worker path
  });

  test("mattpocock:grill-me and grill-with-docs are router stubs; the real target is mattpocock:grilling", async () => {
    const catalog = await loadCatalog();
    const grillMe = catalog.entries.find((e) => e.id === "mattpocock:grill-me");
    const grillWithDocs = catalog.entries.find((e) => e.id === "mattpocock:grill-with-docs");
    const grilling = catalog.entries.find((e) => e.id === "mattpocock:grilling");
    expect(grillMe?.upstream_path).toBe("skills/productivity/grill-me/SKILL.md");
    expect(grillWithDocs?.upstream_path).toBe("skills/engineering/grill-with-docs/SKILL.md");
    expect(grilling, "grilling addition must exist").toBeTruthy();
    expect(grilling?.upstream_path).toBe("skills/productivity/grilling/SKILL.md");
  });

  test("the three delegated-stronger-alternative additions are present with a real local body", async () => {
    const catalog = await loadCatalog();
    const tdd = catalog.entries.find((e) => e.id === "pstack:tdd");
    const attackThePremise = catalog.entries.find((e) => e.id === "pstack:principle-attack-the-premise");
    const grilling = catalog.entries.find((e) => e.id === "mattpocock:grilling");
    expect(tdd?.upstream_path).toBe("pstack/skills/tdd/SKILL.md");
    expect(tdd?.vault_path).toBe("skills/upstream/cursor-plugins-pstack/pstack/skills/tdd/SKILL.md");
    expect(attackThePremise?.upstream_path).toBe("pstack/skills/principle-attack-the-premise/SKILL.md");
    expect(attackThePremise?.activation).toBe("auto-candidate");
    expect(grilling?.status).toBe("reference-only"); // captain-scope, never picked by category/auto
    expect(grilling?.vault_path).toBe("skills/upstream/mattpocock-skills/skills/productivity/grilling/SKILL.md");
  });

  test("mattpocock:code-review is a real adapted derivative, not the unmodified upstream path", async () => {
    const catalog = await loadCatalog();
    const entry = catalog.entries.find((e) => e.id === "mattpocock:code-review");
    expect(entry?.upstream_path).toBe("skills/engineering/code-review/SKILL.md"); // provenance: where it came from
    expect(entry?.vault_path).toBe("skills/adapted/mattpocock/code-review/SKILL.md"); // what's actually read
    expect(entry?.vault_path).not.toBe(`skills/upstream/mattpocock-skills/${entry?.upstream_path}`);
  });

  test("installed entries carry no local vault_path -- they resolve through ~/.agents/skills", async () => {
    const catalog = await loadCatalog();
    const installed = catalog.entries.filter((e) => e.status === "installed");
    expect(installed.length).toBe(8);
    for (const e of installed) {
      expect(e.vault_path, e.id).toBeNull();
      expect(cachePath(e), e.id).toMatch(/^~\/\.agents\/skills\//);
    }
  });

  test("no upstream_path escapes its source directory (no .. traversal)", async () => {
    const catalog = await loadCatalog();
    for (const e of catalog.entries) {
      if (e.upstream_path) expect(e.upstream_path, e.id).not.toContain("..");
    }
  });

  test("every non-null upstream_path is relative (never absolute, never a URL)", async () => {
    const catalog = await loadCatalog();
    for (const e of catalog.entries) {
      if (e.upstream_path) {
        expect(e.upstream_path.startsWith("/"), e.id).toBe(false);
        expect(e.upstream_path.startsWith("http"), e.id).toBe(false);
      }
    }
  });
});
