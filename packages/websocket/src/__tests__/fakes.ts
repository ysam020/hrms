/**
 * Test doubles for the websocket package: an in-memory Redis with
 * the commands the registry uses (incl. PUBLISH receiver counts), and a
 * minimal Socket.IO server with real room semantics.
 */
import { EventEmitter } from "events";

export class FakeRedisServer {
  sets = new Map<string, Set<string>>();
  strings = new Map<string, string>();
  hashes = new Map<string, Map<string, string>>();
  subs = new Map<string, Set<FakeRedis>>();
  down = false;
}

export class FakeRedis extends EventEmitter {
  constructor(public srv: FakeRedisServer) {
    super();
  }
  private guard() {
    if (this.srv.down) throw new Error("redis down");
  }
  async sadd(k: string, ...m: string[]) {
    this.guard();
    const s = this.srv.sets.get(k) ?? new Set<string>();
    m.forEach((x) => s.add(x));
    this.srv.sets.set(k, s);
    return m.length;
  }
  async srem(k: string, ...m: string[]) {
    this.guard();
    const s = this.srv.sets.get(k);
    m.forEach((x) => s?.delete(x));
    if (s && s.size === 0) this.srv.sets.delete(k);
    return m.length;
  }
  async smembers(k: string) {
    this.guard();
    return [...(this.srv.sets.get(k) ?? [])];
  }
  async exists(k: string) {
    this.guard();
    return this.srv.strings.has(k) || this.srv.sets.has(k) ? 1 : 0;
  }
  async set(k: string, v: string) {
    this.guard();
    this.srv.strings.set(k, v);
    return "OK";
  }
  async del(k: string) {
    this.guard();
    this.srv.strings.delete(k);
    this.srv.sets.delete(k);
    return 1;
  }
  async hset(k: string, f: string, v: string) {
    this.guard();
    const h = this.srv.hashes.get(k) ?? new Map();
    h.set(f, v);
    this.srv.hashes.set(k, h);
    return 1;
  }
  async hget(k: string, f: string) {
    this.guard();
    return this.srv.hashes.get(k)?.get(f) ?? null;
  }
  async hdel(k: string, f: string) {
    this.guard();
    this.srv.hashes.get(k)?.delete(f);
    return 1;
  }
  async publish(ch: string, msg: string) {
    this.guard();
    const subs = [...(this.srv.subs.get(ch) ?? [])];
    for (const s of subs) setImmediate(() => s.emit("message", ch, msg));
    return subs.length;
  }
  async subscribe(...chs: string[]) {
    this.guard();
    for (const ch of chs) {
      const s = this.srv.subs.get(ch) ?? new Set();
      s.add(this);
      this.srv.subs.set(ch, s);
    }
    return chs.length;
  }
  unsubscribeAll() {
    for (const s of this.srv.subs.values()) s.delete(this);
  }
  pipeline() {
    const ops: Array<() => Promise<unknown>> = [];
    const p: any = {};
    for (const cmd of ["sadd", "srem", "set", "del", "hset", "hdel"]) {
      p[cmd] = (...a: any[]) => {
        ops.push(() => (this as any)[cmd](...a));
        return p;
      };
    }
    p.exec = async () => {
      const out = [];
      for (const op of ops) out.push([null, await op()]);
      return out;
    };
    return p;
  }
}

/** One fake process: its own Redis connections to the shared server. */
export function connectionsFor(srv: FakeRedisServer) {
  const conns = {
    client: new FakeRedis(srv),
    publisher: new FakeRedis(srv),
    subscriber: new FakeRedis(srv),
  };
  return conns;
}

export class FakeSocket extends EventEmitter {
  rooms = new Set<string>();
  emitted: Array<[string, unknown]> = [];
  connected = true;
  constructor(
    public io: FakeIo,
    public id: string,
    public userId: string,
    public tenantId: string | null,
  ) {
    super();
  }
  join(room: string) {
    this.rooms.add(room);
    const r = this.io.sockets.adapter.rooms.get(room) ?? new Set<string>();
    r.add(this.id);
    this.io.sockets.adapter.rooms.set(room, r);
  }
  // server → client
  emit(event: string, ...args: any[]): boolean {
    if (event === "disconnect" || event === "error")
      return super.emit(event, ...args);
    this.emitted.push([event, args[0]]);
    return true;
  }
  disconnect() {
    if (!this.connected) return this;
    this.connected = false;
    for (const room of this.rooms) {
      const r = this.io.sockets.adapter.rooms.get(room);
      r?.delete(this.id);
      if (r && r.size === 0) this.io.sockets.adapter.rooms.delete(room);
    }
    this.rooms.clear();
    this.io.sockets.sockets.delete(this.id);
    super.emit("disconnect", "server namespace disconnect");
    return this;
  }
}

export class FakeIo extends EventEmitter {
  private n = 0;
  sockets = {
    sockets: new Map<string, FakeSocket>(),
    adapter: { rooms: new Map<string, Set<string>>() },
  };
  to(room: string) {
    return {
      emit: (event: string, payload: unknown) => {
        for (const id of this.sockets.adapter.rooms.get(room) ?? []) {
          this.sockets.sockets.get(id)?.emit(event, payload);
        }
      },
    };
  }
  connect(userId: string, tenantId: string | null = "t1") {
    const s = new FakeSocket(this, `s${++this.n}`, userId, tenantId);
    this.sockets.sockets.set(s.id, s);
    this.emit("connection", s);
    return s;
  }
}

export const tick = () => new Promise((r) => setImmediate(r));
export const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};
