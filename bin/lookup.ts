#!/usr/bin/env bun
// Minimal read-only lookup over the committed catalog. Never mutates anything.
// Two modes only:
//   bin/lookup.ts --id <id>
//   bin/lookup.ts --category <CATEGORY>
//
// --category returns the FULL deterministic shortlist (no artificial cap): the
// final <=3-row, project-local-wins selection is a policy decision made outside
// this repo, not something this lookup fakes by truncating real candidates.

import { lookupByCategory, lookupById, parseCatalog, renderIdRow, renderRow, type Catalog } from "./lib/catalog.ts";

const ROOT = new URL("..", import.meta.url).pathname;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const catalog: Catalog = parseCatalog(await Bun.file(`${ROOT}catalog.yaml`).text());

  const id = flag(args, "--id");
  const category = flag(args, "--category");

  if (id) {
    const entry = lookupById(catalog, id);
    if (!entry) {
      console.error(`no row for id ${id} (unknown id, or a catalog/team-only/restricted row -- those are never looked up)`);
      process.exit(1);
    }
    console.log(renderIdRow(entry));
    return;
  }

  if (category) {
    for (const entry of lookupByCategory(catalog, category)) console.log(renderRow(entry));
    return;
  }

  console.error("usage: bin/lookup.ts --id <id> | --category <CATEGORY>");
  process.exit(2);
}

await main();
