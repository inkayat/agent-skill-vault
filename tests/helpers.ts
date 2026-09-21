import { parseCatalog, type Catalog } from "../bin/lib/catalog.ts";

const ROOT = new URL("..", import.meta.url).pathname;

let cached: Catalog | null = null;

/** Loads and validates the real, committed catalog.yaml once per test process. */
export async function loadCatalog(): Promise<Catalog> {
  if (!cached) {
    const text = await Bun.file(`${ROOT}catalog.yaml`).text();
    cached = parseCatalog(text);
  }
  return cached;
}

export function repoRoot(): string {
  return ROOT;
}
