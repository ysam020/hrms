/**
 * In-memory stand-in for the Redis set commands the scheduler's backlog
 * notification limits use (utils/backlogNotifications.ts). Shared by every
 * test that runs those jobs, so none of them reaches a real Redis.
 */
const sets = new Map<string, Set<string>>();

const setOf = (key: string) => {
  if (!sets.has(key)) sets.set(key, new Set());
  return sets.get(key)!;
};

export const fakeRedis = {
  async smembers(key: string): Promise<string[]> {
    return [...(sets.get(key) ?? [])];
  },
  async sismember(key: string, member: string): Promise<number> {
    return sets.get(key)?.has(member) ? 1 : 0;
  },
  async srem(key: string, ...members: string[]): Promise<number> {
    const set = sets.get(key);
    return members.filter((m) => set?.delete(m)).length;
  },
  multi() {
    const ops: Array<() => void> = [];
    const chain = {
      del(key: string) {
        ops.push(() => sets.delete(key));
        return chain;
      },
      sadd(key: string, ...members: string[]) {
        ops.push(() => members.forEach((m) => setOf(key).add(m)));
        return chain;
      },
      expire(_key: string, _seconds: number) {
        return chain;
      },
      async exec() {
        ops.forEach((op) => op());
        return [];
      },
    };
    return chain;
  },
};

export function resetFakeRedis(): void {
  sets.clear();
}

export function fakeRedisSet(key: string): string[] {
  return [...(sets.get(key) ?? [])];
}
