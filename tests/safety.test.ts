import { describe, expect, test } from "bun:test";
import { ALLOWED_LOOKUP_STATUSES, compactRows, lookupById } from "../bin/lib/catalog.ts";
import { loadCatalog } from "./helpers.ts";

const STATUSES = ["installed", "firstmate_candidate", "reference-only", "catalog", "team-only", "restricted"] as const;
const ACTIVATIONS = ["auto-candidate", "explicit", "never"] as const;

describe("safe status/activation combinations", () => {
  test("every (status, activation) pair in the real catalog is one of the two safe shapes", async () => {
    const catalog = await loadCatalog();
    for (const e of catalog.entries) {
      const safe =
        (e.status === "firstmate_candidate" && (e.activation === "auto-candidate" || e.activation === "explicit")) ||
        (e.status !== "firstmate_candidate" && e.activation === "never");
      expect(safe, `${e.id}: (${e.status}, ${e.activation})`).toBe(true);
    }
  });

  test("the unsafe half of the full (status, activation) truth table is empty in the real catalog", async () => {
    const catalog = await loadCatalog();
    const seen = new Set(catalog.entries.map((e) => `${e.status}|${e.activation}`));
    for (const status of STATUSES) {
      for (const activation of ACTIVATIONS) {
        const isCandidateStatus = status === "firstmate_candidate";
        const isSafe = isCandidateStatus ? activation !== "never" : activation === "never";
        if (!isSafe) {
          expect(seen.has(`${status}|${activation}`), `${status}/${activation} must never appear`).toBe(false);
        }
      }
    }
  });

  test("the lookup surface (compactRows) contains only installed/firstmate_candidate/reference-only, exactly ALLOWED_LOOKUP_STATUSES", async () => {
    const catalog = await loadCatalog();
    const rows = compactRows(catalog);
    expect(rows.length).toBeGreaterThan(0);
    for (const e of rows) {
      expect(e.status in ALLOWED_LOOKUP_STATUSES, e.id).toBe(true);
      expect(["catalog", "team-only", "restricted"]).not.toContain(e.status);
    }
  });

  test("explicit-id lookup refuses catalog, team-only, and restricted rows even on an exact match", async () => {
    const catalog = await loadCatalog();
    const excludedStatusExamples = catalog.entries.filter((e) => e.status === "catalog" || e.status === "team-only" || e.status === "restricted");
    expect(excludedStatusExamples.length).toBeGreaterThan(0);
    for (const e of excludedStatusExamples) {
      expect(lookupById(catalog, e.id), e.id).toBeNull();
    }
  });

  test("team-only rows never appear in compactRows, matching restricted and catalog", async () => {
    const catalog = await loadCatalog();
    const teamOnly = catalog.entries.filter((e) => e.status === "team-only");
    expect(teamOnly.length).toBe(6);
    const compactIds = new Set(compactRows(catalog).map((e) => e.id));
    for (const e of teamOnly) {
      expect(compactIds.has(e.id), e.id).toBe(false);
    }
  });

  test("orchestration/lifecycle items named in the manifest are never eligible for a worker brief pick", async () => {
    const catalog = await loadCatalog();
    const mustBeInert = [
      "pstack:poteto-mode",
      "pstack:arena",
      "pstack:swarm",
      "pstack:interrogate",
      "thermos:thermos",
      "brooks:brooks-sweep",
      "superpowers:using-superpowers",
      "superpowers:using-git-worktrees",
      "superpowers:finishing-a-development-branch",
      "gstack:cso",
      "mattpocock:wayfinder",
      "mattpocock:to-spec",
      "mattpocock:to-tickets",
    ];
    for (const id of mustBeInert) {
      const entry = catalog.entries.find((e) => e.id === id);
      expect(entry, id).toBeTruthy();
      expect(entry?.activation, id).toBe("never");
      expect(["restricted", "team-only"]).toContain(entry!.status);
      expect(lookupById(catalog, id), id).toBeNull();
    }
  });
});
