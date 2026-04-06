# Real-time Features

HRMS uses **Socket.IO 4** for real-time communication. The Socket.IO server is attached to the same HTTPS server as the API gateway. A **Redis adapter** enables horizontal scaling across multiple gateway instances.

---

## Architecture

```
React client (Socket.IO client)
        │
        │  WebSocket / long-poll
        ▼
API Gateway  (Socket.IO server)
        │
        │  Redis pub/sub (adapter)
        ▼
   Redis   ──────────────────────────────────────────
                          ▲         ▲
                          │         │
              Other gateway     Notification
              instances         service
```

---

## Authentication

Every Socket.IO connection is authenticated before it is accepted:

1. The client sends the JWT access token in `socket.handshake.auth.token`.
2. The server middleware verifies the token and resolves the username.
3. On success, the socket is joined to the user's personal room: `user:<username>`.
4. On failure, the connection is rejected with `Error("Unauthorized")`.

---

## Chat

**Namespace:** `chat`

Chat rooms are persisted in MongoDB (`ChatRoom` and `Message` models). Socket.IO handles delivery; the database is the source of truth.

### Events (client → server)

| Event             | Payload                                 | Description                            |
| ----------------- | --------------------------------------- | -------------------------------------- |
| `send_message`    | `{ roomId, content, type, replyToId? }` | Send a text or file message            |
| `typing`          | `{ roomId }`                            | Broadcast typing indicator to the room |
| `stop_typing`     | `{ roomId }`                            | Stop typing indicator                  |
| `message_deleted` | `{ messageId, roomId }`                 | Request message deletion               |
| `mark_read`       | `{ roomId }`                            | Mark all messages in the room as read  |

### Events (server → client)

| Event                 | Payload                 | Description                                    |
| --------------------- | ----------------------- | ---------------------------------------------- |
| `message_sent`        | Full `Message` object   | New message broadcast to all room participants |
| `user_typing`         | `{ username, roomId }`  | Someone is typing                              |
| `user_stopped_typing` | `{ username, roomId }`  | Typing stopped                                 |
| `message_deleted`     | `{ messageId, roomId }` | Message deleted — remove from UI               |
| `read_receipt`        | `{ messageId, readBy }` | Message read by a participant                  |

### File uploads

File attachments are uploaded via `POST /api/file-upload` (REST, not Socket.IO). The returned S3 URL is then sent as a `file`-type message via the socket. The upload endpoint applies SSRF protection:

- Blocks private IP ranges (`127.x`, `10.x`, `192.168.x`, `172.16.x–31.x`)
- Verifies DNS resolution doesn't point to a private IP
- Only accepts HTTPS URLs from the whitelisted S3 domain

---

## Notifications

**Namespace:** `notifications`

In-app notifications are created by backend services (leave approvals, KYC updates, etc.) and published to a Redis channel. The gateway subscribes and broadcasts to the target user's Socket.IO room.

### Events (server → client)

| Event                  | Payload              | Description                                   |
| ---------------------- | -------------------- | --------------------------------------------- |
| `new_notification`     | Notification object  | A new in-app notification arrived             |
| `notification_cleared` | `{ notificationId }` | A notification was dismissed from another tab |

### Push notifications (FCM)

For out-of-app delivery (when the browser tab is closed), notifications are dispatched via **Firebase Cloud Messaging** through the notification-service. FCM tokens are registered by the client on login (`POST /api/fcm-token`) and cleaned up nightly by the scheduler.

---

## Presence (Online Status)

Users joining the Socket.IO server emit a presence signal. The gateway tracks connected usernames and can broadcast presence updates to interested clients.

- User connects → joins `user:<username>` room
- User disconnects → room is vacated
- Presence state is ephemeral (in Redis via Socket.IO adapter)

---

## Redis Adapter

The Socket.IO Redis adapter (`@socket.io/redis-adapter`) allows multiple API gateway instances to share Socket.IO state:

- Room memberships are stored in Redis
- Events emitted on one instance are forwarded to all instances
- Enables horizontal scaling without sticky sessions

Configuration is centralized in `packages/websocket/src/socketio.ts` and shared by the gateway.

---

## Client Setup (React)

**File:** `apps/web/src/app/providers/SocketContext.tsx`

```tsx
// Simplified example
const socket = io(VITE_SOCKET_URL, {
  auth: { token: getAccessToken() },
  transports: ["websocket"],
  withCredentials: true,
});
```

The `SocketContext` provider:

1. Initializes the connection after login.
2. Re-authenticates if the access token is refreshed.
3. Tears down the connection on logout.
4. Exposes the `socket` instance to all feature components.
