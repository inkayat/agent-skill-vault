// Shared catalog schema, parsing, validation, and rendering for the skill vault.
// Single source of truth for the shape every consumer (render, lookup, tests) agrees on.
//
// Content model: firstmate-config pins/caches this repo's own root, not any upstream
// repo. So every firstmate_candidate AND reference-only entry carries a real local
// vault_path under skills/upstream/<source>/... (untouched snapshot) or
// skills/adapted/... (rewritten derivative, header-tagged). installed rows resolve
// globally via ~/.agents/skills/<name>. catalog/team-only/restricted rows stay
// metadata-only: no vault_path, no local body, never resolvable by any lookup.

export type Status =
  | "installed"
  | "firstmate_candidate"
  | "reference-only"
  | "catalog"
  | "team-only"
  | "restricted";

export type Activation = "auto-candidate" | "explicit" | "never";
export type Scope = "worker" | "captain" | "worker+captain";
export type Origin = "canonical" | "mirror";
export type Rights = "clear" | "derived-unreviewed" | "unclear";

export interface Source {
  repo: string;
  sha: string;
  license: string;
  license_evidence: string;
  origin: Origin;
  rights: Rights;
  pinned: boolean;
  notes?: string;
}

export interface Entry {
  id: string;
  source: string;
  /** Path within the upstream source repo this entry was read from (provenance only). */
  upstream_path: string | null;
  /**
   * Real local repo-relative path a worker/Captain actually reads: either
   * skills/upstream/<source>/<upstream_path> (untouched) or skills/adapted/...
   * (rewritten, header-tagged). Non-null for firstmate_candidate (auto-candidate
   * or explicit pick) and reference-only (explicit-id/captain reference only,
   * never category/auto selection) entries; null for installed/catalog/
   * team-only/restricted. Every non-null value must be a row in `vendored`,
   * which is the sole authority for that file's bytes.
   */
  vault_path: string | null;
  status: Status;
  activation: Activation;
  scope: Scope;
  categories: string[];
  cluster: string;
  installed_as?: string;
  notes: string;
}

/**
 * One maintained file under skills/. The authoritative vendored-file inventory:
 * every skill body, prompt, reference, helper, script, and license byte the vault
 * maintains, with the source (hence repo+commit) it came from and its expected hash.
 * Nothing else records a hash or a pin: tests and pin bumps both read this list.
 */
export interface VendoredFile {
  /** Repo-relative local path under skills/upstream/ or skills/adapted/. */
  path: string;
  /** Key in `sources`; supplies repo and commit. */
  source: string;
  /** Path in the source repo at that commit, or null for an adapted derivative. */
  upstream_path: string | null;
  /** sha256 of the local file's bytes. */
  sha256: string;
}

export interface Catalog {
  version: number;
  sources: Record<string, Source>;
  entries: Entry[];
  vendored: VendoredFile[];
}

const STATUSES: Record<string, true> = {
  installed: true,
  firstmate_candidate: true,
  "reference-only": true,
  catalog: true,
  "team-only": true,
  restricted: true,
};
const ACTIVATIONS: Record<string, true> = { "auto-candidate": true, explicit: true, never: true };
const SCOPES: Record<string, true> = { worker: true, captain: true, "worker+captain": true };
const ORIGINS: Record<string, true> = { canonical: true, mirror: true };
const RIGHTS: Record<string, true> = { clear: true, "derived-unreviewed": true, unclear: true };

/**
 * Statuses a lookup (by id or by category) is ever allowed to surface. catalog,
 * team-only, and restricted rows are metadata/inert by design and must never
 * reach a worker or Captain as a pick, even via an exact-id request.
 */
export const ALLOWED_LOOKUP_STATUSES: Record<string, true> = {
  installed: true,
  firstmate_candidate: true,
  "reference-only": true,
};

const SHA_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

// Markers that disqualify a body from auto-candidate eligibility: lifecycle verbs,
// orchestration primitives, and host-binding surfaces the captain's intent excludes.
export const FORBIDDEN_MARKERS: readonly string[] = [
  "subagent_type",
  "run_in_background",
  "Task subagent",
  "hooks:",
  "allowed-tools:",
  "gbrain:",
  "CLAUDE_PLUGIN_ROOT",
  "~/.claude",
  "~/.cursor",
  "agent-transcripts",
];

/** status=firstmate_candidate AND activation=auto-candidate. Derived, never stored. */
export function isCandidate(entry: Entry): boolean {
  return entry.status === "firstmate_candidate" && entry.activation === "auto-candidate";
}

/** Every schema/invariant violation found in a catalog. Empty = valid. */
export function validateCatalog(catalog: Catalog): string[] {
  const errors: string[] = [];
  if (catalog.version !== 1) errors.push(`version: expected 1, got ${catalog.version}`);

  for (const [sid, s] of Object.entries(catalog.sources)) {
    if (!s.repo) errors.push(`source ${sid}: missing repo`);
    if (s.pinned && !SHA_RE.test(s.sha)) errors.push(`source ${sid}: pinned but sha is not 40 hex chars: ${s.sha}`);
    if (!s.license) errors.push(`source ${sid}: missing license`);
    if (!(s.origin in ORIGINS)) errors.push(`source ${sid}: bad origin ${s.origin}`);
    if (!(s.rights in RIGHTS)) errors.push(`source ${sid}: bad rights ${s.rights}`);
    if (s.rights === "unclear" && s.pinned) {
      errors.push(`source ${sid}: rights=unclear must be pinned=false (metadata-only)`);
    }
    if (!s.license_evidence) errors.push(`source ${sid}: missing license_evidence`);
  }

  const vendoredPaths = new Set<string>();
  if (!Array.isArray(catalog.vendored)) errors.push("vendored: missing authoritative vendored-file inventory");
  for (const v of catalog.vendored ?? []) {
    if (vendoredPaths.has(v.path)) errors.push(`vendored ${v.path}: duplicate inventory row`);
    vendoredPaths.add(v.path);
    if (!isContainedVaultPath(v.path)) {
      errors.push(`vendored ${v.path}: path must stay under skills/upstream/ or skills/adapted/ with no traversal`);
    }
    if (!catalog.sources[v.source]) errors.push(`vendored ${v.path}: unknown source ${v.source}`);
    if (!SHA256_RE.test(v.sha256)) errors.push(`vendored ${v.path}: sha256 is not 64 hex chars: ${v.sha256}`);
    if (v.path.startsWith("skills/upstream/")) {
      if (!v.upstream_path) {
        errors.push(`vendored ${v.path}: an upstream snapshot requires upstream_path`);
      } else if (v.path !== `skills/upstream/${v.source}/${v.upstream_path}`) {
        errors.push(`vendored ${v.path}: path must equal skills/upstream/${v.source}/${v.upstream_path}`);
      }
    } else if (v.upstream_path !== null) {
      errors.push(`vendored ${v.path}: an adapted derivative must set upstream_path: null (it is not byte-identical to one upstream file)`);
    }
  }

  const seenIds = new Set<string>();
  for (const e of catalog.entries) {
    if (seenIds.has(e.id)) errors.push(`entry ${e.id}: duplicate id`);
    seenIds.add(e.id);

    if (!catalog.sources[e.source]) errors.push(`entry ${e.id}: unknown source ${e.source}`);
    if (!(e.status in STATUSES)) errors.push(`entry ${e.id}: bad status ${e.status}`);
    if (!(e.activation in ACTIVATIONS)) errors.push(`entry ${e.id}: bad activation ${e.activation}`);
    if (!(e.scope in SCOPES)) errors.push(`entry ${e.id}: bad scope ${e.scope}`);
    if (typeof e.notes !== "string") {
      errors.push(`entry ${e.id}: notes must be a string (use empty string for none), got ${typeof e.notes}`);
    }

    // The load-bearing invariant: only firstmate_candidate rows may auto-load or be
    // named explicitly; every other status is never eligible for a worker brief pick.
    if (e.status === "firstmate_candidate") {
      if (e.activation !== "auto-candidate" && e.activation !== "explicit") {
        errors.push(`entry ${e.id}: status=firstmate_candidate requires activation in {auto-candidate, explicit}, got ${e.activation}`);
      }
    } else if (e.activation !== "never") {
      errors.push(`entry ${e.id}: status=${e.status} requires activation=never, got ${e.activation}`);
    }

    if (e.status === "installed" && !e.installed_as) {
      errors.push(`entry ${e.id}: status=installed requires installed_as`);
    }
    if (e.status !== "installed" && e.installed_as) {
      errors.push(`entry ${e.id}: installed_as set but status=${e.status}`);
    }

    const src = catalog.sources[e.source];
    if (src && !src.pinned && e.status !== "catalog") {
      errors.push(`entry ${e.id}: source ${e.source} is not pinned (metadata-only) but status=${e.status} needs content`);
    }

    // Content-model invariant: firstmate_candidate AND reference-only rows carry a
    // real local body (the only two statuses ever surfaced by lookup with content),
    // and that body must be an inventory row -- `vendored` owns its hash and pin.
    // installed/catalog/team-only/restricted never carry a vault_path.
    if (e.status === "firstmate_candidate" || e.status === "reference-only") {
      if (!e.vault_path) {
        errors.push(`entry ${e.id}: status=${e.status} requires a real local vault_path`);
      } else if (!isContainedVaultPath(e.vault_path)) {
        errors.push(`entry ${e.id}: vault_path must stay under skills/upstream/ or skills/adapted/ with no traversal, got ${e.vault_path}`);
      } else if (!vendoredPaths.has(e.vault_path)) {
        errors.push(`entry ${e.id}: vault_path ${e.vault_path} has no row in the vendored inventory`);
      } else if (e.vault_path.startsWith("skills/upstream/") && e.vault_path !== `skills/upstream/${e.source}/${e.upstream_path}`) {
        errors.push(`entry ${e.id}: vault_path must mirror its own source+upstream_path, got ${e.vault_path}`);
      }
    } else if (e.vault_path) {
      errors.push(`entry ${e.id}: status=${e.status} must not carry a vault_path (metadata-only)`);
    }
  }

  return errors;
}

export function parseCatalog(yamlText: string): Catalog {
  const raw = Bun.YAML.parse(yamlText) as Catalog;
  const errors = validateCatalog(raw);
  if (errors.length > 0) {
    throw new Error(`catalog.yaml failed validation:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  return raw;
}

/** Where a worker/Captain reads this entry's body from, or null if never read. */
export function cachePath(entry: Entry): string | null {
  if (entry.status === "installed") {
    return entry.installed_as ? `~/.agents/skills/${entry.installed_as}` : null;
  }
  return entry.vault_path;
}

/** Rows eligible to appear in the lookup surface: installed, firstmate_candidate, reference-only only. */
export function lookupSurface(catalog: Catalog): Entry[] {
  return catalog.entries
    .filter((e) => e.status in ALLOWED_LOOKUP_STATUSES)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Deterministic base 8-column row shared by category shortlists and explicit-id lookups. */
export function renderRow(entry: Entry): string {
  return [entry.id, entry.status, entry.activation, entry.scope, entry.categories.join(","), entry.cluster, cachePath(entry) ?? "", String(isCandidate(entry))].join("\t");
}

/**
 * Escapes a free-text field for embedding as a single TSV field: a literal
 * backslash, tab, or newline (LF or CRLF) is backslash-escaped so the result
 * can never introduce an extra column or row boundary. Deterministic and
 * reversible; reuses the existing tab-joined row convention instead of a
 * second format (JSON, CSV quoting, ...).
 */
export function escapeTsvField(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Explicit-id row: the same 8 base columns plus the entry's `notes` --
 * escaped via escapeTsvField -- as a 9th, final field. Only `--id` output
 * carries this column; category shortlists stay the unchanged 8-column shape
 * (renderRow) so ordinary consultation cost never grows.
 */
export function renderIdRow(entry: Entry): string {
  return `${renderRow(entry)}\t${escapeTsvField(entry.notes)}`;
}

/** Repo-relative path containment: stays under skills/upstream/ or skills/adapted/, no traversal. */
export function isContainedVaultPath(path: string): boolean {
  if (!path.startsWith("skills/upstream/") && !path.startsWith("skills/adapted/")) return false;
  return !path.split("/").includes("..") && !path.startsWith("/") && !path.includes("\\");
}

/**
 * Explicit-id lookup: only installed, firstmate_candidate, or reference-only rows
 * (ALLOWED_LOOKUP_STATUSES). catalog/team-only/restricted ids always return null,
 * even on an exact match, because those statuses are never surfaced to a picker.
 */
export function lookupById(catalog: Catalog, id: string): Entry | null {
  return lookupSurface(catalog).find((e) => e.id === id) ?? null;
}

/**
 * Full, deterministic category shortlist: every firstmate_candidate row with
 * activation=auto-candidate whose categories include `category`, sorted by id.
 * Unbounded by design -- FirstMate/the Captain makes the final <=3-row, <=1-vault-pick
 * selection (with project-local skills winning ties) as a policy decision outside
 * this repo; truncating the shortlist here would hide real candidates from that
 * choice instead of informing it.
 */
export function lookupByCategory(catalog: Catalog, category: string): Entry[] {
  return lookupSurface(catalog)
    .filter((e) => isCandidate(e) && e.categories.includes(category))
    .sort((a, b) => a.id.localeCompare(b.id));
}
