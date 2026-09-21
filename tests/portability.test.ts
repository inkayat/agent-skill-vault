import { describe, expect, test } from "bun:test";
import { FORBIDDEN_MARKERS, isCandidate } from "../bin/lib/catalog.ts";
import { loadCatalog, repoRoot } from "./helpers.ts";

const MAX_BYTES = 24 * 1024;

describe("auto-candidate eligibility: declared size limits", () => {
  test("every auto-candidate entry declares a verified size_bytes at or under the 24KB cap", async () => {
    const catalog = await loadCatalog();
    const autoCandidates = catalog.entries.filter(isCandidate);
    expect(autoCandidates.length).toBe(23);
    for (const e of autoCandidates) {
      expect(e.size_bytes, e.id).not.toBeUndefined();
      expect(e.size_bytes!, e.id).toBeLessThanOrEqual(MAX_BYTES);
      expect(e.size_bytes!, e.id).toBeGreaterThan(0);
    }
  });

  test("no non-auto-candidate entry sets size_bytes (it's only meaningful for the eligibility gate)", async () => {
    const catalog = await loadCatalog();
    const misplaced = catalog.entries.filter((e) => !isCandidate(e) && e.size_bytes != null);
    expect(misplaced.map((e) => e.id)).toEqual([]);
  });
});

describe("auto-candidate eligibility: real local vendored content (deterministic, no network)", () => {
  test("every auto-candidate's vendored local body contains none of the forbidden markers, and its real size matches the declared size_bytes", async () => {
    const catalog = await loadCatalog();
    const autoCandidates = catalog.entries.filter(isCandidate);
    for (const e of autoCandidates) {
      expect(e.vault_path, e.id).toBeTruthy();
      const file = Bun.file(`${repoRoot()}${e.vault_path}`);
      expect(await file.exists(), `${e.id} vendored file missing at ${e.vault_path}`).toBe(true);
      const body = await file.text();
      for (const marker of FORBIDDEN_MARKERS) {
        expect(body.includes(marker), `${e.id} contains forbidden marker "${marker}"`).toBe(false);
      }
      expect(file.size, `${e.id} real vendored byte size vs declared size_bytes`).toBe(e.size_bytes);
      expect(file.size, e.id).toBeLessThanOrEqual(MAX_BYTES);
    }
  });
});
