// Shared by seed.ts and cleanup.ts. The manifest is the only record of what
// the load-testing seeder created; cleanup removes nothing that isn't in it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface OrgSpec {
  key: string;
  name: string;
  slug: string;
  dbName: string;
  size: number;
}

export const ORGS: OrgSpec[] = [
  {
    key: "alpha",
    name: "LOADTEST_ Alpha Org",
    slug: "loadtest-alpha",
    dbName: "hrms-loadtest-alpha",
    size: 250,
  },
  {
    key: "beta",
    name: "LOADTEST_ Beta Org",
    slug: "loadtest-beta",
    dbName: "hrms-loadtest-beta",
    size: 60,
  },
];

export interface SeededOrg {
  key: string;
  tenantId: string;
  slug: string;
  dbName: string;
  userIds: string[];
  membershipIds: string[];
  users: { id: string; username: string; role: string }[];
  collectionsAdded: number | null;
}

export interface Manifest {
  runId: string;
  createdAt: string;
  host: string;
  orgs: SeededOrg[];
}

// Scripts run from packages/database (pnpm --filter=@hrms/db exec).
export const MANIFEST_PATH = resolve(
  process.env.LOADTEST_STATE_DIR ??
    resolve(process.cwd(), "../../load-testing/.state"),
  "manifest.json",
);

export function readManifest(): Manifest | null {
  if (!existsSync(MANIFEST_PATH)) return null;
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
}

export function writeManifest(m: Manifest): void {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2), { mode: 0o600 });
}

export function buildUrl(dbName: string): string {
  const base = process.env.DEV_MONGODB_URI!;
  return base.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
}

export const isLoadtestSlug = (slug: string) =>
  /^loadtest-[a-z0-9-]+$/.test(slug);
export const isLoadtestDb = (db: string) =>
  /^hrms-loadtest-[a-z0-9-]+$/.test(db);
export const isLoadtestUsername = (u: string) =>
  /^loadtest_[a-z0-9]+_\d{4}$/.test(u);
