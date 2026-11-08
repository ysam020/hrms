import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import type Redis from "ioredis";

/**
 * Cluster-wide registry of WHICH GATEWAY PROCESSES hold sockets for a
 * (tenant, user). Sockets themselves are tracked by each process locally
 * (Socket.IO rooms); Redis only answers "which nodes must I publish to".
 *
 *   ws:v2:u:<tenant>:<user>   SET   nodeIds holding ≥1 socket for that pair
 *   ws:v2:n:<nodeId>          SET   "<tenant>:<user>" pairs on that node
 *                                   (reverse index, for crash cleanup)
 *   ws:v2:alive:<nodeId>      STR   liveness, EX = NODE_TTL
 *   ws:v2:nodes               SET   every registered nodeId (sweeper input)
 *   channel ws:v2:node:<nodeId>     per-node delivery channel
 *
 * nodeId = <host>:<pid>:<random> — unique per process BOOT, so a restarted
 * container that reuses a PID never receives the dead process's traffic,
 * and two hosts with the same PID never share a channel.
 *
 * Every operation is idempotent (SADD/SREM/DEL), so retries, re-sync after
 * a Redis outage and concurrent sweeps are safe.
 */
export const NODE_TTL_MS = Number(process.env.WS_NODE_TTL_MS) || 30_000;
export const HEARTBEAT_MS =
  Number(process.env.WS_HEARTBEAT_MS) || Math.max(1_000, NODE_TTL_MS / 3);
export const SWEEP_MS = Number(process.env.WS_SWEEP_MS) || NODE_TTL_MS;

export const NODES_KEY = "ws:v2:nodes";
const t = (tenantId: string | null | undefined) => tenantId || "-";
export const userKey = (tenantId: string | null | undefined, userId: string) =>
  `ws:v2:u:${t(tenantId)}:${userId}`;
export const nodeUsersKey = (nodeId: string) => `ws:v2:n:${nodeId}`;
export const aliveKey = (nodeId: string) => `ws:v2:alive:${nodeId}`;
export const nodeChannel = (nodeId: string) => `ws:v2:node:${nodeId}`;
export const pairOf = (tenantId: string | null | undefined, userId: string) =>
  `${t(tenantId)}:${userId}`;
/** Local Socket.IO room holding every socket of one (tenant, user). */
export const userRoom = (tenantId: string | null | undefined, userId: string) =>
  `wsu:${t(tenantId)}:${userId}`;

export function newNodeId(): string {
  return `${hostname()}:${process.pid}:${randomBytes(4).toString("hex")}`;
}

/** v2 message on a node channel. */
export interface NodeMessage {
  v: 2;
  tenantId: string | null;
  userId: string;
  eventName: string;
  payload: unknown;
}

export async function addMembership(
  redis: Redis,
  nodeId: string,
  tenantId: string | null,
  userId: string,
): Promise<void> {
  await redis
    .pipeline()
    .sadd(userKey(tenantId, userId), nodeId)
    .sadd(nodeUsersKey(nodeId), pairOf(tenantId, userId))
    .exec();
}

export async function removeMembership(
  redis: Redis,
  nodeId: string,
  tenantId: string | null,
  userId: string,
): Promise<void> {
  await redis
    .pipeline()
    .srem(userKey(tenantId, userId), nodeId)
    .srem(nodeUsersKey(nodeId), pairOf(tenantId, userId))
    .exec();
}

export async function heartbeat(redis: Redis, nodeId: string): Promise<void> {
  await redis
    .pipeline()
    .set(aliveKey(nodeId), "1", "PX", NODE_TTL_MS)
    .sadd(NODES_KEY, nodeId)
    .exec();
}

/**
 * Removes every membership of a node that is no longer alive. Safe to run
 * concurrently from several nodes (all operations idempotent) and while
 * traffic flows. A live node is never swept: its alive key exists. A node
 * that was alive but cut off from Redis longer than NODE_TTL is swept, and
 * re-registers its sockets when it reconnects (`resync`).
 */
export async function sweepDeadNodes(
  redis: Redis,
  selfNodeId: string,
): Promise<{ sweptNodes: number; removedMemberships: number }> {
  const nodes = await redis.smembers(NODES_KEY);
  let sweptNodes = 0;
  let removedMemberships = 0;
  for (const node of nodes) {
    if (node === selfNodeId) continue;
    if (await redis.exists(aliveKey(node))) continue;
    const pairs = await redis.smembers(nodeUsersKey(node));
    const p = redis.pipeline();
    for (const pair of pairs) {
      const sep = pair.indexOf(":");
      p.srem(userKey(pair.slice(0, sep), pair.slice(sep + 1)), node);
    }
    p.del(nodeUsersKey(node));
    p.srem(NODES_KEY, node);
    await p.exec();
    sweptNodes++;
    removedMemberships += pairs.length;
  }
  return { sweptNodes, removedMemberships };
}

/**
 * Publishes one v2 message to every node holding sockets for the pair,
 * except `skipNodeId` (the caller delivers locally itself). Returns the
 * number of nodes that received it. A member whose channel had no
 * subscriber AND whose alive key is gone is pruned (lazy cleanup).
 */
export async function publishToNodes(
  redis: Redis,
  publisher: Redis,
  tenantId: string | null,
  userId: string,
  eventName: string,
  payload: unknown,
  skipNodeId?: string,
): Promise<number> {
  const members = await redis.smembers(userKey(tenantId, userId));
  const message: NodeMessage = { v: 2, tenantId, userId, eventName, payload };
  const body = JSON.stringify(message);
  let reached = 0;
  await Promise.all(
    members
      .filter((m) => m !== skipNodeId)
      .map(async (node) => {
        const receivers = await publisher.publish(nodeChannel(node), body);
        if (receivers > 0) {
          reached++;
          return;
        }
        if (!(await redis.exists(aliveKey(node)))) {
          await removeMembership(redis, node, tenantId, userId);
        }
      }),
  );
  return reached;
}
