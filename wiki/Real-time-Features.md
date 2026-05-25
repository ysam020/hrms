# Real-time Features

HRMS uses **Socket.IO 4** for real-time communication. The Socket.IO server is attached to the same HTTPS server as the API gateway. A **Redis adapter** enables horizontal scaling across multiple gateway instances.

---

## Architecture

```
React client (Socket.IO client)
        │
        │  WebSocket / long-poll (HTTPS)
        ▼
API Gateway  (Socket.IO server — @hrms/websocket)
        │
        │  @socket.io/redis-adapter (pub/sub)
        ▼
   Redis ──────────────────────────────────────────
                          ▲
                          │
              Other gateway instances
              (horizontal scale, no sticky sessions)
```

---

## Authentication

Every Socket.IO connection is authenticated before it is accepted:

1. The client sends the JWT access token in `socket.handshake.auth.token`.
2. The server middleware (in `@hrms/websocket`) verifies the token.
3. On success, the socket is joined to the user's personal room: `user:<username>`.
4. On failure, the connection is rejected with `Error("Unauthorized")`.

When the access token is refreshed (via the Axios interceptor), the Socket.IO client reconnects with the updated token to maintain a valid session.

---

## Chat

**Namespace:** `chat`

Chat rooms (`ChatRoom`) and messages (`Message`) are persisted in MongoDB. Socket.IO handles real-time delivery; the database is the source of truth for message history.

### REST endpoints (history + management)

| Method | Endpoint                                   | Description                          |
| ------ | ------------------------------------------ | ------------------------------------ |
| GET    | `/api/chat/conversations`                  | List chat rooms for the current user |
| POST   | `/api/chat/conversations/start`            | Start or find a direct conversation  |
| GET    | `/api/chat/conversations/:roomId/messages` | Paginated message history            |
| PUT    | `/api/chat/conversations/:roomId/read`     | Mark all messages as read            |
| GET    | `/api/chat/unread-counts`                  | Unread count per room                |
| POST   | `/api/chat/upload`                         | Upload a file attachment (SSRF-safe) |
| DELETE | `/api/chat/messages/:messageId`            | Soft-delete a message                |
| DELETE | `/api/chat/conversations/:roomId`          | Delete a conversation (for self)     |
| GET    | `/api/og-preview?url=...`                  | Open Graph link preview              |

### Socket events (client → server)

| Event             | Payload                                 | Description                            |
| ----------------- | --------------------------------------- | -------------------------------------- |
| `send_message`    | `{ roomId, content, type, replyToId? }` | Send a text or file message            |
| `typing`          | `{ roomId }`                            | Broadcast typing indicator to the room |
| `stop_typing`     | `{ roomId }`                            | Stop typing indicator                  |
| `message_deleted` | `{ messageId, roomId }`                 | Request message deletion               |
| `mark_read`       | `{ roomId }`                            | Mark all messages in the room as read  |

### Socket events (server → client)

| Event                 | Payload                 | Description                                    |
| --------------------- | ----------------------- | ---------------------------------------------- |
| `message_sent`        | Full `Message` object   | New message broadcast to all room participants |
| `user_typing`         | `{ username, roomId }`  | Someone is typing                              |
| `user_stopped_typing` | `{ username, roomId }`  | Typing stopped                                 |
| `message_deleted`     | `{ messageId, roomId }` | Message deleted — remove from UI               |
| `read_receipt`        | `{ messageId, readBy }` | Message read by a participant                  |

### File uploads

File attachments are uploaded via `POST /api/chat/upload` (REST, not Socket.IO). The returned S3 URL is then sent as a `file`-type message via the socket. The upload endpoint applies SSRF protection:

- Blocks private IP ranges (`127.x`, `10.x`, `192.168.x`, `172.16–31.x`)
- Verifies DNS resolution doesn't resolve to a private IP
- Only accepts S3 HTTPS URLs from the whitelisted domain

### Link preview

`GET /api/og-preview?url=<encoded>` fetches Open Graph metadata (title, description, image) from a URL server-side. The same SSRF protection applies.

### Offline queue

Messages composed while the device is offline are persisted to the `message_outbox` IndexedDB store. A Workbox background sync registers a sync event; when connectivity returns, the queue is drained and messages are delivered via Socket.IO. See [Frontend Architecture](Frontend-Architecture) for the IndexedDB schema.

---

## Notifications

**Namespace:** `notifications`

In-app notifications are created by backend services (leave approvals, KYC updates, etc.) and broadcast to the target user's Socket.IO room. Notifications are also persisted in MongoDB (`Notification` + `NotificationRecipient` models) so they survive page reloads.

### Socket events (server → client)

| Event                  | Payload              | Description                                          |
| ---------------------- | -------------------- | ---------------------------------------------------- |
| `new_notification`     | Notification object  | A new in-app notification arrived                    |
| `notification_cleared` | `{ notificationId }` | A notification was dismissed from another tab/device |

### Push notifications (FCM)

For out-of-app delivery (browser tab closed), notifications are dispatched via **Firebase Cloud Messaging** through the notification-service. FCM tokens are registered on login (`POST /api/save-fcm-token`) and cleaned up nightly by the scheduler.

---

## AI Features (SSE)

The AI chatbot and AI Insights endpoints use **Server-Sent Events (SSE)** rather than WebSocket, because they are unidirectional streaming responses (server → client) that don't require bidirectional communication.

### AI Chatbot

`POST /api/chatbot/message` — streams the assistant's reply in real time.

The chatbot runs a **tool-calling loop** (up to 5 iterations):

1. User message sent to Ollama (qwen2.5-coder:14b).
2. If the model emits a tool call (e.g. `getAttendance`, `getLeaveBalance`), the gateway executes it against the tenant's database.
3. The tool result is appended to the conversation context.
4. The model generates the next token; loop repeats until the model emits a final text response.

Available tools: `getAttendance`, `getLeaveBalance`, `getLeaveApplications`, `getEmployee`, `getJobOpenings`, `getHrActivities`.

Custom error handling in the chatbot route bypasses the standard `handleError` utility because SSE requires writing to `res` (the stream) rather than returning a JSON response — this exception is intentional.

### AI Insights

`GET /api/ai-insights?module=<module>&period=<period>` — streams a one-shot analytical report for a given HRMS module and time period. Unlike the chatbot, this is a single generation with no tool calls.

---

## Presence (Online Status)

Users joining the Socket.IO server are assigned to a personal room (`user:<username>`). The gateway tracks connected sockets and can broadcast presence updates to interested clients.

- Connect → join `user:<username>` room
- Disconnect → room vacated
- Presence state is ephemeral (in Redis via Socket.IO adapter)

---

## Redis Adapter

The `@socket.io/redis-adapter` stores room memberships in Redis and forwards events across multiple API gateway instances. This enables horizontal scaling without sticky sessions:

- Any gateway instance can emit to any room.
- All instances receive room-scoped events.

Configuration is centralised in `@hrms/websocket` and injected at gateway startup.

---

## Client Setup (React)

**File:** `apps/web/src/app/providers/SocketContext.tsx`

```tsx
const socket = io(VITE_SOCKET_URL, {
  auth: { token: getAccessToken() },
  transports: ["websocket"],
  withCredentials: true,
});
```

The `SocketContext` provider:

1. Initialises the connection after a successful login.
2. Re-authenticates (reconnects with updated token) when the access token is refreshed.
3. Tears down the connection on logout.
4. Exposes the `socket` instance to all feature components via `useContext(SocketContext)`.
