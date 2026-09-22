import { describe, expect, test } from "bun:test";
import { isCandidate } from "../bin/lib/catalog.ts";
import { loadCatalog, repoRoot } from "./helpers.ts";

const MAX_BYTES = 24 * 1024;

describe("auto-candidate eligibility: size cap measured on the real vendored file", () => {
  // Forbidden-marker coverage lives in tests/selectable-safety.test.ts, which checks the whole
  // selectable closure (explicit picks and their support files too), not just auto-candidates.
  // The cap is measured on disk: the catalog records curation, never a second copy of a fact
  // the file itself already carries.
  test("every auto-candidate's vendored body is non-empty and at or under the 24KB cap", async () => {
    const catalog = await loadCatalog();
    const autoCandidates = catalog.entries.filter(isCandidate);
    expect(autoCandidates.length).toBeGreaterThan(0);
    for (const e of autoCandidates) {
      expect(e.vault_path, e.id).toBeTruthy();
      const file = Bun.file(`${repoRoot()}${e.vault_path}`);
      expect(await file.exists(), `${e.id} vendored file missing at ${e.vault_path}`).toBe(true);
      expect(file.size, e.id).toBeGreaterThan(0);
      expect(file.size, `${e.id} exceeds the ${MAX_BYTES}-byte auto-candidate cap`).toBeLessThanOrEqual(MAX_BYTES);
    }
  });

  test("an explicit pick may exceed the cap; the cap only gates category shortlists", async () => {
    const catalog = await loadCatalog();
    const explicitPicks = catalog.entries.filter((e) => e.status === "firstmate_candidate" && !isCandidate(e));
    expect(explicitPicks.length).toBeGreaterThan(0);
    for (const e of explicitPicks) {
      expect(await Bun.file(`${repoRoot()}${e.vault_path}`).exists(), e.id).toBe(true);
    }
  });
});
