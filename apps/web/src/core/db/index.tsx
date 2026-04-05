/**
 * IndexedDB service for HRMS
 *
 * Stores:
 *   messages          – chat messages, keyed by _id, indexed by roomId
 *   conversations     – conversation list, keyed by _id
 *   notifications     – notification history, keyed by _id
 *   analytics_cache   – analytics API responses, keyed by endpoint URL
 *   pagination_cache  – paginated table pages, keyed by cacheKey+page
 *   message_outbox    – unsent chat messages (offline queue), keyed by tempId
 */

const DB_NAME = "hrms_db";
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // messages
      if (!db.objectStoreNames.contains("messages")) {
        const store = db.createObjectStore("messages", { keyPath: "_id" });
        store.createIndex("roomId", "roomId", { unique: false });
        store.createIndex("roomId_timestamp", ["roomId", "createdAt"], {
          unique: false,
        });
      }

      // conversations
      if (!db.objectStoreNames.contains("conversations")) {
        db.createObjectStore("conversations", { keyPath: "_id" });
      }

      // notifications
      if (!db.objectStoreNames.contains("notifications")) {
        const store = db.createObjectStore("notifications", { keyPath: "_id" });
        store.createIndex("timeStamp", "timeStamp", { unique: false });
      }

      // analytics_cache – { key, data, timestamp, ttl }
      if (!db.objectStoreNames.contains("analytics_cache")) {
        db.createObjectStore("analytics_cache", { keyPath: "key" });
      }

      // pagination_cache – { key, data, totalCount, timestamp }
      if (!db.objectStoreNames.contains("pagination_cache")) {
        db.createObjectStore("pagination_cache", { keyPath: "key" });
      }

      // message_outbox – { tempId, roomId, payload, queuedAt }
      if (!db.objectStoreNames.contains("message_outbox")) {
        const store = db.createObjectStore("message_outbox", {
          keyPath: "tempId",
        });
        store.createIndex("roomId", "roomId", { unique: false });
      }
    };

    req.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      _db = db;
      db.onversionchange = () => {
        db.close();
        _db = null;
      };
      resolve(db);
    };

    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode = "readonly") {
  return openDB().then((db) => {
    const transaction = db.transaction(storeName, mode as IDBTransactionMode);
    const store = transaction.objectStore(storeName);
    return store;
  });
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function getMessagesByRoom(roomId) {
  const store = await tx("messages");
  const index = store.index("roomId");
  return promisify(index.getAll(roomId));
}

export async function saveMessages(messages) {
  if (!messages || messages.length === 0) return;
  const store = await tx("messages", "readwrite");
  const puts = messages.map((msg) => promisify(store.put(msg)));
  return Promise.all(puts);
}

export async function saveMessage(message) {
  const store = await tx("messages", "readwrite");
  return promisify(store.put(message));
}

export async function patchMessage(messageId, patch) {
  const store = await tx("messages", "readwrite");
  const existing = await promisify(store.get(messageId));
  if (existing) {
    return promisify(store.put({ ...(existing as object), ...patch }));
  }
}

export async function deleteMessageFromDB(messageId) {
  const store = await tx("messages", "readwrite");
  return promisify(store.delete(messageId));
}

export async function deleteRoomMessages(roomId) {
  const store = await tx("messages", "readwrite");
  const index = store.index("roomId");
  const keys = (await promisify(index.getAllKeys(roomId))) as IDBValidKey[];
  await Promise.all(keys.map((k) => promisify(store.delete(k))));
}

// ── Conversations ─────────────────────────────────────────────────────────────

export async function getConversations() {
  const store = await tx("conversations");
  return promisify(store.getAll());
}

export async function saveConversations(conversations) {
  if (!conversations || conversations.length === 0) return;
  const store = await tx("conversations", "readwrite");
  await Promise.all(conversations.map((c) => promisify(store.put(c))));
}

export async function saveConversation(conversation) {
  const store = await tx("conversations", "readwrite");
  return promisify(store.put(conversation));
}

export async function deleteConversationFromDB(roomId) {
  const store = await tx("conversations", "readwrite");
  return promisify(store.delete(roomId));
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function getNotifications() {
  const store = await tx("notifications");
  const all = (await promisify(store.getAll())) as any[];
  // Return sorted newest-first
  return all.sort(
    (a, b) => new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime(),
  );
}

export async function saveNotifications(notifications) {
  if (!notifications || notifications.length === 0) return;
  const store = await tx("notifications", "readwrite");
  await Promise.all(notifications.map((n) => promisify(store.put(n))));
}

export async function saveNotification(notification) {
  const store = await tx("notifications", "readwrite");
  return promisify(store.put(notification));
}

// Keep only the most recent N notifications to avoid unbounded growth
export async function pruneNotifications(maxCount = 200) {
  const store = await tx("notifications", "readwrite");
  const all = (await promisify(store.getAll())) as any[];
  if (all.length <= maxCount) return;
  const sorted = all.sort(
    (a, b) => new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime(),
  );
  const toDelete = sorted.slice(maxCount);
  await Promise.all(toDelete.map((n) => promisify(store.delete(n._id))));
}

// ── Analytics cache ───────────────────────────────────────────────────────────

const ANALYTICS_TTL = 5 * 60 * 1000; // 5 minutes

export async function getAnalyticsCache(endpoint) {
  const store = await tx("analytics_cache");
  const entry = (await promisify(store.get(endpoint))) as any;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > (entry.ttl ?? ANALYTICS_TTL)) return null;
  return entry.data;
}

export async function setAnalyticsCache(endpoint, data, ttl = ANALYTICS_TTL) {
  const store = await tx("analytics_cache", "readwrite");
  return promisify(
    store.put({ key: endpoint, data, timestamp: Date.now(), ttl }),
  );
}

export async function invalidateAnalyticsCache(pattern) {
  const store = await tx("analytics_cache", "readwrite");
  const all = (await promisify(store.getAllKeys())) as string[];
  const toDelete = pattern ? all.filter((k) => k.includes(pattern)) : all;
  await Promise.all(toDelete.map((k) => promisify(store.delete(k))));
}

// ── Pagination cache ──────────────────────────────────────────────────────────

const PAGINATION_TTL = 2 * 60 * 1000; // 2 minutes

export async function getPaginationCache(key) {
  const store = await tx("pagination_cache");
  const entry = (await promisify(store.get(key))) as any;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > PAGINATION_TTL) return null;
  return { data: entry.data, totalCount: entry.totalCount };
}

export async function setPaginationCache(key, data, totalCount) {
  const store = await tx("pagination_cache", "readwrite");
  return promisify(store.put({ key, data, totalCount, timestamp: Date.now() }));
}

export async function invalidatePaginationCache(keyPrefix) {
  const store = await tx("pagination_cache", "readwrite");
  const allKeys = (await promisify(store.getAllKeys())) as string[];
  const toDelete = keyPrefix
    ? allKeys.filter((k) => k.startsWith(keyPrefix))
    : allKeys;
  await Promise.all(toDelete.map((k) => promisify(store.delete(k))));
}

// ── Message outbox (offline queue) ────────────────────────────────────────────

export async function enqueueMessage(tempId, roomId, payload) {
  const store = await tx("message_outbox", "readwrite");
  return promisify(
    store.put({ tempId, roomId, payload, queuedAt: Date.now() }),
  );
}

export async function dequeueMessage(tempId) {
  const store = await tx("message_outbox", "readwrite");
  return promisify(store.delete(tempId));
}

export async function getPendingMessages() {
  const store = await tx("message_outbox");
  return promisify(store.getAll());
}

export async function clearPendingMessages() {
  const store = await tx("message_outbox", "readwrite");
  return promisify(store.clear());
}
