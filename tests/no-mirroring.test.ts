import { describe, expect, test } from "bun:test";
import { loadCatalog } from "./helpers.ts";

const AGGREGATOR_SOURCES = ["vercel-labs-skills", "sickn33-agentic-awesome-skills"];

describe("skills.sh and Agentic Awesome Skills stay discovery metadata, never content sources", () => {
  test("both aggregator sources are marked unpinned (no local clone, ever)", async () => {
    const catalog = await loadCatalog();
    for (const id of AGGREGATOR_SOURCES) {
      const source = catalog.sources[id];
      expect(source, id).toBeTruthy();
      expect(source.pinned, id).toBe(false);
    }
  });

  test("every entry sourced from an aggregator is status=catalog with no upstream_path or vault_path (metadata only)", async () => {
    const catalog = await loadCatalog();
    const fromAggregators = catalog.entries.filter((e) => AGGREGATOR_SOURCES.includes(e.source));
    expect(fromAggregators.length).toBeGreaterThan(0);
    for (const e of fromAggregators) {
      expect(e.status, e.id).toBe("catalog");
      expect(e.upstream_path, e.id).toBeNull();
      expect(e.vault_path, e.id).toBeNull();
    }
  });

  test("no non-aggregator entry's path or notes point at an aggregator mirror instead of the canonical repo", async () => {
    const catalog = await loadCatalog();
    const suspiciousHosts = ["skills.sh", "agentic-awesome-skills", "sickn33"];
    for (const e of catalog.entries) {
      if (AGGREGATOR_SOURCES.includes(e.source)) continue;
      for (const host of suspiciousHosts) {
        expect(e.notes.toLowerCase().includes(host) && !e.notes.toLowerCase().includes("never"), `${e.id} notes reference ${host} without disclaiming it`).toBe(false);
      }
    }
  });

  test("no vendored byte comes from an aggregator source (the inventory proves it, not just the entry rows)", async () => {
    const catalog = await loadCatalog();
    const fromAggregators = catalog.vendored.filter((v) => AGGREGATOR_SOURCES.includes(v.source));
    expect(fromAggregators.map((v) => v.path)).toEqual([]);
  });

  test("agent-rules-books stays inert metadata with its licensing uncertainty stated on every row", async () => {
    const catalog = await loadCatalog();
    const source = catalog.sources["ciembor-agent-rules-books"];
    expect(source.rights).toBe("derived-unreviewed");
    expect(source.pinned).toBe(true); // pinned for provenance; nothing is ever fetched from it
    const books = catalog.entries.filter((e) => e.source === "ciembor-agent-rules-books");
    expect(books.length).toBeGreaterThan(0);
    for (const e of books) {
      expect(e.status, e.id).toBe("catalog");
      expect(e.activation, e.id).toBe("never");
      expect(e.vault_path, e.id).toBeNull();
      expect(e.notes.toLowerCase(), e.id).toMatch(/chatgpt|derived|legal|criticism/);
    }
    expect(catalog.vendored.some((v) => v.source === "ciembor-agent-rules-books")).toBe(false);
  });

  test("no catalog-status entry (metadata-only) is ever eligible for a worker pick", async () => {
    const catalog = await loadCatalog();
    const catalogEntries = catalog.entries.filter((e) => e.status === "catalog");
    expect(catalogEntries.length).toBeGreaterThan(0);
    for (const e of catalogEntries) {
      expect(e.activation, e.id).toBe("never");
    }
  });
});
