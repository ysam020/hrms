import cluster from "node:cluster";
import { randomUUID } from "node:crypto";
import type { Lookup } from "geoip-lite";

/**
 * geoip-lite loads its whole database into about 140 MB of buffers when
 * imported. It is only used to score logins, so one copy is loaded on first
 * use in the cluster primary and workers ask it over IPC. A slow or failed
 * lookup means no location, which login scoring already handles.
 */

const LOOKUP_TIMEOUT_MS = 1_000;
const REQUEST = "geoip:lookup";
const REPLY = "geoip:result";

export type GeoResult = Pick<Lookup, "country" | "city" | "ll"> | null;

async function lookupHere(ip: string): Promise<GeoResult> {
  const mod = await import("geoip-lite");
  const geoip = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const hit = geoip.lookup(ip);
  return hit ? { country: hit.country, city: hit.city, ll: hit.ll } : null;
}

export function lookupGeo(ip: string): Promise<GeoResult> {
  if (!cluster.isWorker || !process.send) {
    return lookupHere(ip).catch(() => null);
  }
  return new Promise((resolve) => {
    const id = randomUUID();
    const finish = (result: GeoResult) => {
      clearTimeout(timer);
      process.off("message", onMessage);
      resolve(result);
    };
    const onMessage = (msg: {
      type?: string;
      id?: string;
      geo?: GeoResult;
    }) => {
      if (msg?.type === REPLY && msg.id === id) finish(msg.geo ?? null);
    };
    const timer = setTimeout(() => finish(null), LOOKUP_TIMEOUT_MS);
    timer.unref();
    process.on("message", onMessage);
    process.send!({ type: REQUEST, id, ip }, undefined, undefined, (err) => {
      if (err) finish(null);
    });
  });
}

/** Installed once in the cluster primary. */
export function serveGeoLookups(clusterModule: typeof cluster): void {
  clusterModule.on("message", (worker, msg) => {
    if (msg?.type !== REQUEST) return;
    void lookupHere(String(msg.ip))
      .catch(() => null)
      .then((geo) => {
        if (worker.isConnected()) {
          worker.send({ type: REPLY, id: msg.id, geo });
        }
      });
  });
}
