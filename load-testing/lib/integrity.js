// Read-only before/after snapshot proving the GET workload wrote nothing:
// document counts of every collection in the synthetic tenant databases,
// plus the synthetic tenants' master rows (tenant documents, user count and
// newest user updatedAt, membership count). The app's Prisma audit
// middleware records every write it makes in the tenant's `auditlogs`, so
// that count doubles as a tripwire for application writes.
export async function integritySnapshot(atlas, manifest) {
  const snap = { at: new Date().toISOString(), orgs: {} };
  const master = atlas.db("hrms-dev");
  for (const org of manifest.orgs) {
    const db = atlas.db(org.dbName);
    const collections = {};
    for (const { name } of await db
      .listCollections({}, { nameOnly: true })
      .toArray()) {
      if (name.startsWith("system.")) continue;
      collections[name] = await db.collection(name).countDocuments({});
    }
    const { ObjectId } = await import("mongodb");
    const tid = new ObjectId(org.tenantId);
    const tenantDoc = await master.collection("tenants").findOne({ _id: tid });
    const users = await master
      .collection("users")
      .aggregate([
        { $match: { tenantId: tid, username: { $regex: "^loadtest_" } } },
        {
          $group: {
            _id: null,
            n: { $sum: 1 },
            maxUpdated: { $max: "$updatedAt" },
          },
        },
      ])
      .toArray();
    snap.orgs[org.key] = {
      collections,
      tenant: tenantDoc ? JSON.stringify(tenantDoc) : null,
      users: users[0]?.n ?? 0,
      usersMaxUpdatedAt: users[0]?.maxUpdated?.toISOString?.() ?? null,
      memberships: await master
        .collection("tenant_memberships")
        .countDocuments({ tenantId: tid }),
    };
  }
  return snap;
}

/** Differences between two snapshots; an empty list means nothing changed. */
export function integrityDiff(before, after) {
  const diffs = [];
  for (const [key, b] of Object.entries(before.orgs)) {
    const a = after.orgs[key];
    if (!a) {
      diffs.push(`${key}: missing after`);
      continue;
    }
    const names = new Set([
      ...Object.keys(b.collections),
      ...Object.keys(a.collections),
    ]);
    for (const n of names) {
      if (b.collections[n] !== a.collections[n])
        diffs.push(
          `${key}.${n}: ${b.collections[n] ?? "absent"} → ${a.collections[n] ?? "absent"} documents`,
        );
    }
    if (b.tenant !== a.tenant) diffs.push(`${key}: tenant document changed`);
    if (b.users !== a.users)
      diffs.push(`${key}: users ${b.users} → ${a.users}`);
    if (b.usersMaxUpdatedAt !== a.usersMaxUpdatedAt)
      diffs.push(
        `${key}: a user document was updated (${b.usersMaxUpdatedAt} → ${a.usersMaxUpdatedAt})`,
      );
    if (b.memberships !== a.memberships)
      diffs.push(`${key}: memberships ${b.memberships} → ${a.memberships}`);
  }
  return diffs;
}
