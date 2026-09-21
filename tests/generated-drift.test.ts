import { describe, expect, test } from "bun:test";
import { compactRows, isCandidate, renderCompactTsv, renderSourcesLock } from "../bin/lib/catalog.ts";
import { loadCatalog, repoRoot } from "./helpers.ts";

describe("generated files match catalog.yaml (no drift)", () => {
  test("catalog.compact.tsv is byte-identical to a fresh render", async () => {
    const catalog = await loadCatalog();
    const fresh = renderCompactTsv(catalog);
    const committed = await Bun.file(`${repoRoot()}catalog.compact.tsv`).text();
    expect(committed).toBe(fresh);
  });

  test("sources.lock is byte-identical to a fresh render", async () => {
    const catalog = await loadCatalog();
    const fresh = renderSourcesLock(catalog);
    const committed = await Bun.file(`${repoRoot()}sources.lock`).text();
    expect(committed).toBe(fresh);
  });

  test("a fresh render is deterministic (stable row order across repeated calls)", async () => {
    const catalog = await loadCatalog();
    expect(renderCompactTsv(catalog)).toBe(renderCompactTsv(catalog));
    expect(renderSourcesLock(catalog)).toBe(renderSourcesLock(catalog));
  });

  test("catalog.compact.tsv's last column (candidate) matches the derived isCandidate() for every row, never stored separately", async () => {
    const catalog = await loadCatalog();
    const tsvLines = renderCompactTsv(catalog).trim().split("\n");
    const rows = compactRows(catalog);
    expect(tsvLines.length).toBe(rows.length);
    tsvLines.forEach((line, i) => {
      const columns = line.split("\t");
      expect(columns.length, rows[i].id).toBe(8); // id status activation scope categories cluster cache_path candidate
      expect(columns[0], "id column").toBe(rows[i].id);
      expect(columns[7], `${rows[i].id} candidate column`).toBe(String(isCandidate(rows[i])));
    });
    const trueCount = tsvLines.filter((l) => l.endsWith("\ttrue")).length;
    expect(trueCount).toBe(23); // exactly the 23 auto-candidates
  });
});
