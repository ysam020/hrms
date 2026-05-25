# Frontend Architecture

The frontend is a React 18 SPA built with Vite 8 and TypeScript, served by nginx in production. It supports offline use via a service worker + IndexedDB and communicates with the API gateway over HTTPS, WebSocket, and binary Protobuf.

---

## Technology Stack

| Category          | Library / Tool                                        |
| ----------------- | ----------------------------------------------------- |
| UI framework      | React 18                                              |
| Build tool        | Vite 8                                                |
| Language          | TypeScript                                            |
| Component library | Material UI (MUI) v6 + PrimeReact v10                 |
| Styling           | SASS, CSS Modules                                     |
| Routing           | React Router v6                                       |
| Forms             | Formik                                                |
| Validation        | Zod                                                   |
| HTTP client       | Axios (with interceptors + protobuf support)          |
| Real-time         | Socket.IO client v4                                   |
| Charts            | ApexCharts                                            |
| Calendar          | React Big Calendar                                    |
| Biometrics        | Face-api.js (Web Worker offloaded)                    |
| XSS protection    | DOMPurify                                             |
| Service worker    | Workbox                                               |
| Offline storage   | IndexedDB (6 stores via custom wrapper)               |
| Web Workers       | 3 dedicated workers (export, face recognition, timer) |
| Path alias        | `@web/` → `src/`                                      |

---

## Source Layout

```
apps/web/src/
├── app/
│   ├── App.tsx                       # Root component, theme provider, route tree
│   ├── App.scss                      # Global styles
│   └── providers/
│       ├── ThemeContext.tsx           # Light/dark with localStorage persistence
│       ├── UserContext.tsx            # Current user profile
│       ├── AlertContext.tsx           # Global toast / snackbar
│       ├── SocketContext.tsx          # Socket.IO connection lifecycle
│       └── ChatUnreadContext.tsx      # Unread message count for badge
│
├── core/
│   ├── auth/                         # In-memory access token store
│   ├── config/                       # App-wide constants, env helpers
│   ├── db/                           # IndexedDB wrapper (offline cache)
│   │   └── index.tsx                 # 6 object stores + CRUD helpers
│   ├── http/
│   │   └── axiosConfig.ts            # Axios instance + interceptor pipeline
│   ├── shortcuts/                    # Global keyboard shortcut registration
│   ├── webauthn/                     # navigator.credentials API wrappers
│   └── workers/
│       ├── excelExport.worker.ts     # Spreadsheet generation off main thread
│       ├── faceRecognition.worker.ts # Face-api.js off main thread
│       └── timer.worker.ts           # High-resolution timer for check-in/out
│
├── features/                         # Feature modules (each = a page/section)
│   ├── analytics/
│   ├── attendance/
│   ├── auth/                         # Login form, OAuth redirect handler
│   ├── chat/
│   ├── dashboard/
│   ├── developer/                    # Developer mode, log streaming
│   ├── employee-kyc/
│   ├── employee-management/
│   ├── holidays/
│   ├── hr-activities/
│   ├── job-openings/
│   ├── layout/                       # App shell: sidebar, topbar, breadcrumbs
│   ├── org-settings/                 # Tenant settings management
│   ├── policy/
│   ├── profile/
│   ├── resignation/
│   └── rules/
│
├── pages/
│   ├── HomePage.tsx                  # Authenticated landing page
│   ├── LoginPage.tsx                 # Public login page
│   ├── CareersPage.tsx               # Public careers listing
│   └── JobApplicationPage.tsx        # Public job application form
│
├── shared/
│   ├── components/                   # Reusable UI components
│   ├── constants/
│   │   └── apiEndpoints.ts           # Central registry of all API paths
│   ├── hooks/                        # Custom hooks (useIsMounted, useAlert, …)
│   └── utils/                        # Pure utility functions
│
├── styles/                           # Feature-specific SASS files
└── main.tsx                          # Entry point (ReactDOM.createRoot)
```

---

## Routing

React Router v6 defines the route tree in `App.tsx`:

```
/                       → HomePage (authenticated shell)
  /dashboard            → Dashboard
  /employees            → Employee list
  /employee/:username   → Employee profile
  /attendance           → Attendance page
  /leave                → Leave management
  /recruitment          → Job openings + pipeline
  /hr-activities        → HR events and announcements
  /policies             → Policy documents
  /payroll              → Payslips
  /analytics            → Analytics dashboards
  /profile              → Own profile
  /chat                 → Direct messaging
  /settings             → Org settings (TenantSettings)
  /rules                → Business rules builder
  /developer            → Developer mode (identity-verified)

/login                  → LoginPage (public)
/careers                → CareersPage (public)
/careers/:jobId/apply   → JobApplicationPage (public)
```

Protected routes redirect to `/login` if no valid access token is present.

---

## State Management

HRMS uses **React Context + hooks** — no Redux or external state library.

| Context             | What it holds                                   |
| ------------------- | ----------------------------------------------- |
| `UserContext`       | Current user object, `setUser`, loading state   |
| `ThemeContext`      | `theme` (`light`/`dark`), `toggleTheme`         |
| `AlertContext`      | `setAlert(message, severity)` for global toasts |
| `SocketContext`     | Connected Socket.IO instance                    |
| `ChatUnreadContext` | Total unread message count for badge display    |

Local form state is managed with **Formik** + **Zod** validation schemas.

---

## HTTP Client

**File:** `src/core/http/axiosConfig.ts`

Single `apiClient` Axios instance pre-configured with:

- Base URL from `VITE_API_STRING`
- `withCredentials: true` (sends the `httpOnly` refresh token cookie)
- 30-second timeout
- AbortController registry (cancels in-flight requests on unmount)
- GET deduplication (parallel identical GETs share one inflight request)
- Idempotency keys on POST/PUT (prevents duplicate submissions)

### Request interceptor pipeline

1. **Proactive token refresh** — if the access token expires within 60 seconds, call `POST /api/refresh-token` before attaching it. Concurrent calls share a single promise — only one refresh request is sent.
2. **CSRF injection** — lazily fetches the CSRF token on the first state-changing request; re-uses for subsequent calls; invalidated on logout or 403.
3. **Protobuf mode** — if `config.isProto` is set, adds `Content-Type: application/x-protobuf` + `Accept: application/x-protobuf, application/json` and sets `responseType: arraybuffer`.

### Response interceptor

On `401 Unauthorized`:

1. Call `POST /api/refresh-token` to get a new access token.
2. Retry the original request once with the new token.
3. If refresh also fails, redirect to `/login`.

### Protobuf requests

Analytics endpoints return binary Protobuf responses for performance. Pass `isProto: true` in the Axios config to enable:

```typescript
const response = await apiClient.get("/analytics/workforce", { isProto: true });
// response.data is an ArrayBuffer — decode with generated protobuf stubs
const decoded = WorkforceResponse.decode(new Uint8Array(response.data));
```

---

## API Endpoint Registry

**File:** `src/shared/constants/apiEndpoints.ts`

All API paths are centralised in `API_ENDPOINTS`. Never hardcode a path in a component — import the constant instead:

```typescript
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";

await apiClient.get(API_ENDPOINTS.GET_PROFILE);
await apiClient.post(API_ENDPOINTS.ADD_LEAVE, payload);
await apiClient.get(API_ENDPOINTS.GET_ORG_SETTINGS);
await apiClient.post(API_ENDPOINTS.CREATE_SUBSCRIPTION);
await apiClient.post(API_ENDPOINTS.SELECT_TENANT, { tenantId });
```

Sections in the registry: `NOTIFICATIONS`, `CHAT`, `PERMISSIONS`, `CALENDAR`, `ATTENDANCE`, `LEAVE`, `KYC`, `EMPLOYEE`, `HOLIDAYS`, `HR_ACTIVITIES`, `JOB_OPENINGS`, `RESIGNATION`, `SALARY_MANAGEMENT`, `USER`, `RULES`, `POLICY`, `UPLOAD`, `CHATBOT`, `AI_INSIGHTS`, `DEVELOPER`, `ORG_SETTINGS`, `PAYMENT`, `TENANT`.

---

## IndexedDB (Offline Storage)

**File:** `src/core/db/index.tsx`

Six object stores provide offline capabilities and client-side caching:

| Store              | Key path | Purpose                                                   |
| ------------------ | -------- | --------------------------------------------------------- |
| `messages`         | `_id`    | Chat messages; index on `chatRoomId` for room lookups     |
| `conversations`    | `_id`    | Chat room metadata; shown while offline                   |
| `notifications`    | `_id`    | In-app notifications; index on `isCleared`                |
| `analytics_cache`  | `key`    | Analytics query results; avoids re-fetching on tab switch |
| `pagination_cache` | `key`    | Paginated list results (employees, job openings, etc.)    |
| `message_outbox`   | auto-inc | Outgoing messages queued while offline                    |

**Offline chat:** Messages composed while offline are persisted to `message_outbox`. A background sync fires when connectivity is restored, drains the queue, and delivers messages via Socket.IO.

---

## Web Workers

Heavy computation is offloaded to dedicated Web Workers to keep the main thread responsive:

| Worker                      | Purpose                                                                           |
| --------------------------- | --------------------------------------------------------------------------------- |
| `excelExport.worker.ts`     | Generates XLSX files (attendance reports, employee lists) without blocking the UI |
| `faceRecognition.worker.ts` | Runs face-api.js descriptor matching for biometric check-in off the main thread   |
| `timer.worker.ts`           | High-resolution timer driving the check-in/out stopwatch                          |

Workers are spawned via `new Worker(new URL('./workers/…', import.meta.url))` using Vite's native worker support and terminate on component unmount.

---

## Progressive Web App (PWA)

The Workbox service worker handles:

- **Precaching** — all build artifacts (JS, CSS, fonts, images) are precached during the Vite build via `workbox injectManifest`.
- **Runtime caching** — API responses for analytics and pagination are cached with a stale-while-revalidate strategy.
- **Offline fallback** — the shell (`index.html`) is served from cache when offline; data is served from IndexedDB.
- **Background sync** — drains the `message_outbox` IndexedDB store when connectivity returns.

Build pipeline step: `vite build → optimize-images → workbox injectManifest → purge-css`.

---

## Feature Module Structure

Each feature directory contains:

```
features/leave/
├── components/            # Feature-specific React components
│   ├── LeaveApplicationForm.tsx
│   ├── LeaveTable.tsx
│   └── LeaveBalanceCard.tsx
├── hooks/                 # Feature-specific data hooks
│   └── useLeaveData.ts
└── index.tsx              # Feature entry-point (page component)
```

API calls are made inline with `apiClient` (from `@web/core/http/axiosConfig`) and `API_ENDPOINTS`. There is no separate `api/` layer per feature — this keeps the data flow traceable and avoids indirection for simple CRUD.

---

## Theming

- MUI `ThemeProvider` and PrimeReact themes are kept in sync.
- User preference (`light`/`dark`) is persisted in `localStorage`.
- `ThemeContext` exposes `toggleTheme()` called from the topbar.
- CSS custom properties bridge PrimeReact tokens with MUI theme values.

---

## Build Pipeline

Steps run in order by the Vite build script:

1. **`build:wasm`** — compile WebAssembly modules
2. **`vite build`** — bundle, tree-shake, and code-split the React app
3. **`optimize-images`** — generate responsive WebP/AVIF variants via `sharp`
4. **`workbox injectManifest`** — inject the service worker precache manifest
5. **`optimize-css-loading`** — convert blocking `<link>` tags to async preloads
6. **`purge-css`** — strip unused CSS from output bundles

Output: `apps/web/dist/`

### Code splitting

React Router + dynamic `import()` splits the bundle by route. Each feature page is a separate chunk loaded on navigation.

### Bundle analysis

```bash
cd apps/web && pnpm analyze
```

Opens a visual treemap of the bundle (rollup-plugin-visualizer).

---

## Real-time Integration

Socket.IO is initialised once in `SocketContext` on login and torn down on logout.

**Chat namespace:** `send_message`, `message_sent`, `typing`, `stop_typing`, `message_deleted`, `read_receipt`.  
**Notifications namespace:** `new_notification`, `notification_cleared`.

See [Real-time Features](Real-time-Features) for server-side setup.

---

## Environment Variables

| Variable                | Purpose                            |
| ----------------------- | ---------------------------------- |
| `VITE_API_STRING`       | API gateway base URL               |
| `VITE_SOCKET_URL`       | Socket.IO server URL               |
| `VITE_FIREBASE_CONFIG`  | Firebase config JSON (stringified) |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID             |
