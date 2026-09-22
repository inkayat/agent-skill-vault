import { describe, expect, test } from "bun:test";
import { loadCatalog, repoRoot } from "./helpers.ts";

/**
 * Dependency closure: a vendored body that tells its reader to open a path inside its own
 * source tree is useless if that path was never vendored. This walks every inventoried file
 * and requires each intra-source path reference to resolve to another inventory row.
 *
 * Scope, stated honestly: only path-form references into the source tree are checked --
 * anything shaped `../`, `references/`, `scripts/`, `examples/` or `_shared/`. A bare sibling
 * filename (`CONTEXT.md`, `SPEC.md`, `test-guide.md`) and an explicitly project-relative
 * `./src/...` path cannot be told apart offline from a file the skill instructs the reader to
 * CREATE in the target project, so neither is asserted on. This is a real closure check over
 * the observed failure mode, not a claim that every conceivable reference form is enforced.
 */

const PATH_REF = /(?:\]\(|`|\s|^)((?:\.\.\/|references\/|scripts\/|examples\/|_shared\/)[A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:md|sh|py|tsv|json))/gm;

/**
 * References that intentionally do not resolve, each with a checked reason. Upstream text is
 * byte-identical by contract, so a broken upstream path can only be recorded, never edited.
 */
const KNOWN_UNRESOLVABLE: Record<string, string> = {
  // 404 at the pinned commit: upstream's own example row cites a script that does not exist.
  "skills/upstream/cursor-plugins-pstack/pstack/skills/show-me-your-work/SKILL.md::scripts/snapshot.sh":
    "does not exist at the pinned commit (upstream example text)",
};

function sourceRootOf(path: string): string {
  return path.split("/").slice(0, 3).join("/"); // skills/upstream/<source>
}

function normalize(parts: string[]): string {
  const out: string[] = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

/**
 * Candidate resolutions for one reference: upstream bodies address their companions
 * relative to the file, relative to the skill directory, or from the source root.
 */
function resolutions(file: string, ref: string): string[] {
  const fileDir = file.split("/").slice(0, -1).join("/");
  const root = sourceRootOf(file);
  const skillDir = fileDir.split("/").slice(0, -1).join("/");
  return [normalize(`${fileDir}/${ref}`.split("/")), normalize(`${skillDir}/${ref}`.split("/")), normalize(`${root}/${ref}`.split("/"))];
}

describe("dependency closure of vendored bodies", () => {
  test("every intra-source path reference in a vendored file resolves to another inventory row", async () => {
    const catalog = await loadCatalog();
    const inventory = new Set(catalog.vendored.map((v) => v.path));
    const unresolved: string[] = [];

    for (const v of catalog.vendored) {
      if (!v.path.startsWith("skills/upstream/")) continue; // adaptations are self-contained by design
      const text = await Bun.file(`${repoRoot()}${v.path}`).text();
      const root = sourceRootOf(v.path);
      for (const match of text.matchAll(PATH_REF)) {
        const ref = match[1];
        const candidates = resolutions(v.path, ref);
        if (!candidates.some((c) => c.startsWith(`${root}/`))) continue; // escapes the source tree: not ours
        if (candidates.some((c) => inventory.has(c))) continue;
        const key = `${v.path}::${ref}`;
        if (key in KNOWN_UNRESOLVABLE) continue;
        unresolved.push(key);
      }
    }

    expect([...new Set(unresolved)]).toEqual([]);
  });

  test("each recorded unresolvable reference still exists in the body that claims it (the exception list cannot rot)", async () => {
    const catalog = await loadCatalog();
    const inventory = new Set(catalog.vendored.map((v) => v.path));
    for (const key of Object.keys(KNOWN_UNRESOLVABLE)) {
      const [file, ref] = key.split("::");
      expect(inventory.has(file), `${file} is no longer vendored; drop its exception`).toBe(true);
      const text = await Bun.file(`${repoRoot()}${file}`).text();
      expect(text.includes(ref), `${file} no longer references ${ref}; drop its exception`).toBe(true);
    }
  });

  test("the closure check really would catch a missing dependency (it is not vacuously passing)", async () => {
    const catalog = await loadCatalog();
    const inventory = new Set(catalog.vendored.map((v) => v.path));
    // A body that is known to carry real intra-source references, all currently satisfied.
    const body = "skills/upstream/hyhmrright-brooks-lint/skills/brooks-review/SKILL.md";
    const text = await Bun.file(`${repoRoot()}${body}`).text();
    const refs = [...text.matchAll(PATH_REF)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    const resolved = refs.map((r) => resolutions(body, r).find((c) => inventory.has(c)));
    expect(resolved.every(Boolean)).toBe(true);
    // ...and the same machinery reports a miss when the target is absent.
    expect(resolutions(body, "../_shared/does-not-exist.md").some((c) => inventory.has(c))).toBe(false);
  });

  test("every selectable entry's own body, and the support files it pulls in, are inventoried", async () => {
    const catalog = await loadCatalog();
    const inventory = new Set(catalog.vendored.map((v) => v.path));
    const selectable = catalog.entries.filter((e) => e.status === "firstmate_candidate");
    expect(selectable.length).toBeGreaterThan(0);

    for (const e of selectable) {
      const queue = [e.vault_path!];
      const seen = new Set<string>();
      while (queue.length > 0) {
        const path = queue.pop()!;
        if (seen.has(path)) continue;
        seen.add(path);
        expect(inventory.has(path), `${e.id}: ${path} missing from the inventory`).toBe(true);
        if (!path.startsWith("skills/upstream/")) continue;
        const text = await Bun.file(`${repoRoot()}${path}`).text();
        const root = sourceRootOf(path);
        for (const match of text.matchAll(PATH_REF)) {
          const target = resolutions(path, match[1]).find((c) => c.startsWith(`${root}/`) && inventory.has(c));
          if (target) queue.push(target);
        }
      }
    }
  });
});
