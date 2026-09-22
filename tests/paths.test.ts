import { describe, expect, test } from "bun:test";
import { cachePath } from "../bin/lib/catalog.ts";
import { loadCatalog, repoRoot } from "./helpers.ts";

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

  test("the grill-me/grill-with-docs router stubs are gone; mattpocock:grilling is the real Captain-scope skill", async () => {
    const catalog = await loadCatalog();
    for (const id of ["mattpocock:grill-me", "mattpocock:grill-with-docs"]) {
      expect(catalog.entries.find((e) => e.id === id), `${id} was a two-line router stub aliasing grilling`).toBeUndefined();
    }
    const grilling = catalog.entries.find((e) => e.id === "mattpocock:grilling");
    expect(grilling?.status).toBe("reference-only");
    expect(grilling?.scope).toBe("captain");
    expect(grilling?.upstream_path).toBe("skills/productivity/grilling/SKILL.md");
    expect(grilling?.vault_path).toBe("skills/upstream/mattpocock-skills/skills/productivity/grilling/SKILL.md");
  });

  test("the retained delegated-research addition keeps a real local body; the ones cut in hardening are fully gone", async () => {
    const catalog = await loadCatalog();
    const inventory = new Set(catalog.vendored.map((v) => v.path));
    const tdd = catalog.entries.find((e) => e.id === "pstack:tdd");
    expect(tdd?.upstream_path).toBe("pstack/skills/tdd/SKILL.md");
    expect(tdd?.vault_path).toBe("skills/upstream/cursor-plugins-pstack/pstack/skills/tdd/SKILL.md");
    expect(inventory.has(tdd!.vault_path!)).toBe(true);

    // attack-the-premise dragged three unvendored sibling principles; subtract-before-you-add
    // restated Ponytail. Both rows and both bodies were removed, not merely demoted.
    for (const id of ["pstack:principle-attack-the-premise", "pstack:principle-subtract-before-you-add"]) {
      expect(catalog.entries.find((e) => e.id === id), id).toBeUndefined();
    }
    for (const path of [
      "skills/upstream/cursor-plugins-pstack/pstack/skills/principle-attack-the-premise/SKILL.md",
      "skills/upstream/cursor-plugins-pstack/pstack/skills/principle-subtract-before-you-add/SKILL.md",
    ]) {
      expect(inventory.has(path), path).toBe(false);
      expect(await Bun.file(`${repoRoot()}${path}`).exists(), path).toBe(false);
    }
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
