import { describe, expect, test } from "bun:test";
import { loadCatalog, repoRoot } from "./helpers.ts";

async function sha256Hex(text: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(text);
  return hasher.digest("hex");
}

/** true = genuinely unreachable (offline/DNS/timeout); false = we got an HTTP response. */
async function fetchRawOrSkip(
  repo: string,
  sha: string,
  path: string,
): Promise<{ reachable: true; res: Response } | { reachable: false }> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${path}`, { signal: AbortSignal.timeout(10000) });
    return { reachable: true, res };
  } catch {
    return { reachable: false };
  }
}

describe("local vendored content: existence and hash binding (hard-fail, no skip)", () => {
  test("every firstmate_candidate and reference-only vault_path exists on disk", async () => {
    const catalog = await loadCatalog();
    const withLocalContent = catalog.entries.filter((e) => e.status === "firstmate_candidate" || e.status === "reference-only");
    expect(withLocalContent.length).toBe(69); // 48 firstmate_candidate + 21 reference-only
    for (const e of withLocalContent) {
      const exists = await Bun.file(`${repoRoot()}${e.vault_path}`).exists();
      expect(exists, `${e.id}: missing local file at ${e.vault_path}`).toBe(true);
    }
  });

  test("every firstmate_candidate and reference-only content_sha256 matches the actual vendored file (catches drift/corruption)", async () => {
    const catalog = await loadCatalog();
    const withLocalContent = catalog.entries.filter((e) => e.status === "firstmate_candidate" || e.status === "reference-only");
    for (const e of withLocalContent) {
      const body = await Bun.file(`${repoRoot()}${e.vault_path}`).text();
      const actual = await sha256Hex(body);
      expect(actual, `${e.id}: content_sha256 mismatch (file was edited without updating catalog.yaml, or vice versa)`).toBe(e.content_sha256);
    }
  });

  test("acceptance-critical ids resolve to a real local file: mattpocock:grilling and brooks:brooks-test", async () => {
    const catalog = await loadCatalog();
    for (const id of ["mattpocock:grilling", "brooks:brooks-test"]) {
      const entry = catalog.entries.find((e) => e.id === id)!;
      expect(entry, id).toBeTruthy();
      expect(entry.vault_path, id).toBeTruthy();
      expect(await Bun.file(`${repoRoot()}${entry.vault_path}`).exists(), id).toBe(true);
    }
  });

  test("acceptance-critical negative cases never resolve to a local file: a book row, a gstack host-generated row, a team-only row, a restricted row", async () => {
    const catalog = await loadCatalog();
    const negatives = [
      "books:a-philosophy-of-software-design", // derived-unreviewed -> catalog
      "gstack:office-hours", // host-generated -> catalog
      "pstack:arena", // team-only
      "gstack:cso", // restricted
    ];
    for (const id of negatives) {
      const entry = catalog.entries.find((e) => e.id === id)!;
      expect(entry, id).toBeTruthy();
      expect(entry.vault_path, id).toBeNull();
    }
  });
});

describe("license/notice preservation", () => {
  test("every source with at least one vendored (skills/upstream/) entry has a local LICENSE file", async () => {
    const catalog = await loadCatalog();
    const vendoredSourceIds = new Set(
      catalog.entries.filter((e) => e.vault_path?.startsWith("skills/upstream/")).map((e) => e.source),
    );
    expect(vendoredSourceIds.size).toBeGreaterThan(0);
    for (const sid of vendoredSourceIds) {
      const licenseMd = Bun.file(`${repoRoot()}skills/upstream/${sid}/LICENSE`);
      const licenseTxt = Bun.file(`${repoRoot()}skills/upstream/${sid}/LICENSE.txt`);
      const hasLicense = (await licenseMd.exists()) || (await licenseTxt.exists());
      expect(hasLicense, `source ${sid}: no LICENSE/LICENSE.txt vendored under skills/upstream/${sid}/`).toBe(true);
    }
  });
});

describe("pin integrity vs. live upstream (network-optional; a reachable 404 is a failure, not a skip)", () => {
  test(
    "every skills/upstream/ vendored file is byte-identical to the live commit it claims to be pinned at",
    async () => {
      const catalog = await loadCatalog();
      const upstreamEntries = catalog.entries.filter((e) => e.vault_path?.startsWith("skills/upstream/"));
      expect(upstreamEntries.length).toBeGreaterThan(0);

      const results = await Promise.all(
        upstreamEntries.map(async (e) => {
          const source = catalog.sources[e.source];
          const result = await fetchRawOrSkip(source.repo, source.sha, e.upstream_path!);
          return { e, result };
        }),
      );

      let verified = 0;
      let unreachable = 0;
      for (const { e, result } of results) {
        if (!result.reachable) {
          unreachable++;
          continue;
        }
        // We got a response: a non-200 here means the pin is stale/broken, a real failure.
        expect(result.res.ok, `${e.id}: pinned commit no longer serves ${e.upstream_path} (HTTP ${result.res.status}) -- pin is stale or the path moved`).toBe(true);
        const liveBody = await result.res.text();
        const liveHash = await sha256Hex(liveBody);
        expect(liveHash, `${e.id}: locally vendored content no longer matches the live pinned commit`).toBe(e.content_sha256);
        verified++;
      }

      if (unreachable === upstreamEntries.length) {
        console.warn(`pin integrity check: network unreachable for all ${unreachable} entries -- skipped, not failed.`);
      } else {
        console.log(`pin integrity check: verified ${verified}/${upstreamEntries.length} vendored files byte-identical to their live pinned commit (${unreachable} unreachable).`);
      }
    },
    30000,
  );
});
