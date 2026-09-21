#!/usr/bin/env bun
// Renders catalog.compact.tsv and sources.lock deterministically from catalog.yaml.
// catalog.yaml is the single hand-maintained source of truth; these two files are
// generated and committed so the Captain and install.sh never need to run this at
// runtime. Re-run after every catalog.yaml edit: `bun bin/render.ts`.
// `--check` regenerates in memory and exits non-zero if the committed files drifted.

import { parseCatalog, renderCompactTsv, renderSourcesLock } from "./lib/catalog.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const CATALOG_PATH = `${ROOT}catalog.yaml`;
const COMPACT_PATH = `${ROOT}catalog.compact.tsv`;
const LOCK_PATH = `${ROOT}sources.lock`;

async function main() {
  const check = process.argv.includes("--check");
  const yamlText = await Bun.file(CATALOG_PATH).text();
  const catalog = parseCatalog(yamlText);

  const compact = renderCompactTsv(catalog);
  const lock = renderSourcesLock(catalog);

  if (check) {
    const [existingCompact, existingLock] = await Promise.all([
      Bun.file(COMPACT_PATH).text().catch(() => null),
      Bun.file(LOCK_PATH).text().catch(() => null),
    ]);
    const drifted: string[] = [];
    if (existingCompact !== compact) drifted.push("catalog.compact.tsv");
    if (existingLock !== lock) drifted.push("sources.lock");
    if (drifted.length > 0) {
      console.error(`DRIFT: ${drifted.join(", ")} do not match catalog.yaml. Run 'bun bin/render.ts' and commit.`);
      process.exit(1);
    }
    console.log("OK: generated files match catalog.yaml.");
    return;
  }

  await Bun.write(COMPACT_PATH, compact);
  await Bun.write(LOCK_PATH, lock);
  console.log(`Wrote ${COMPACT_PATH} (${compact.split("\n").filter(Boolean).length} rows from ${catalog.entries.length} catalog entries) and ${LOCK_PATH} (${Object.values(catalog.sources).filter((s) => s.pinned).length} pinned sources).`);
}

await main();
