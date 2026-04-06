# Frontend Architecture

The frontend is a React 18 SPA built with Vite 8 and TypeScript, served by nginx in production.

---

## Technology Stack

| Category                       | Library                        |
| ------------------------------ | ------------------------------ |
| UI framework                   | React 18                       |
| Build tool                     | Vite 8                         |
| Language                       | TypeScript                     |
| Component library (enterprise) | PrimeReact v10                 |
| Component library (layout)     | Material UI (MUI) v6 + Emotion |
| Styling                        | SASS, CSS Modules              |
| Routing                        | React Router v6                |
| Forms                          | Formik                         |
| Validation                     | Zod                            |
| HTTP client                    | Axios                          |
| Real-time                      | Socket.IO client v4            |
| Charts                         | ApexCharts                     |
| Calendar                       | React Big Calendar             |
| Grid layout                    | React Grid Layout              |
| Guided tours                   | React Joyride                  |
| Biometrics                     | Face-api.js                    |
| XSS protection                 | DOMPurify                      |
| Service worker                 | Workbox                        |
| Path alias                     | `@web/` → `src/`               |

---

## Source Layout

```
apps/web/src/
├── app/
│   ├── App.tsx                      # Root component, theme provider, route tree
│   ├── App.scss                     # Global styles
│   └── providers/                   # React Context providers
│       ├── ThemeContext.tsx          # Light/dark theme with localStorage persistence
│       ├── UserContext.tsx           # Current user profile
│       ├── AlertContext.tsx          # Global toast/snackbar
│       ├── SocketContext.tsx         # Socket.IO connection
│       └── ChatUnreadContext.tsx     # Unread message count
│
├── core/
│   ├── auth/                        # Access token management, auth state
│   ├── config/                      # App-wide constants, environment helpers
│   ├── db/                          # IndexedDB utilities (offline cache)
│   ├── http/                        # Axios instance + interceptors
│   ├── shortcuts/                   # Global keyboard shortcut registration
│   ├── webauthn/                    # WebAuthn API wrappers
│   └── workers/                     # Web workers for background computation
│
├── features/                        # Feature modules (each = a page or section)
│   ├── analytics/
│   ├── attendance/
│   ├── auth/                        # Login form, OAuth redirect handler
│   ├── chat/
│   ├── dashboard/
│   ├── employee-kyc/
│   ├── employee-management/
│   ├── holidays/
│   ├── hr-activities/
│   ├── job-openings/
│   ├── layout/                      # App shell: sidebar, topbar, breadcrumbs
│   ├── policy/
│   ├── profile/
│   ├── resignation/
│   └── rules/
│
├── pages/
│   ├── HomePage.tsx                 # Authenticated landing page
│   ├── LoginPage.tsx                # Public login page
│   ├── CareersPage.tsx              # Public careers listing
│   └── JobApplicationPage.tsx       # Public job application form
│
├── shared/
│   ├── components/                  # Reusable UI components
│   ├── hooks/                       # Custom hooks (useIsMounted, useAlert, etc.)
│   └── utils/                       # Pure utility functions
│
├── styles/                          # Feature-specific SASS files
└── main.tsx                         # Entry point (ReactDOM.createRoot)
```

---

## Routing

React Router v6 defines the route tree in `App.tsx`. The pattern is:

```
/                      → HomePage (authenticated shell)
  /dashboard           → Dashboard
  /employees           → Employee list
  /employee/:username  → Employee profile
  /attendance          → Attendance page
  /leave               → Leave management
  /recruitment         → Job openings
  /hr-activities       → HR events
  /policies            → Policies
  /payroll             → Payslips
  /analytics           → Analytics dashboard
  /profile             → Own profile
  /chat                → Chat
  /settings            → Settings

/login                 → LoginPage (public)
/careers               → CareersPage (public)
/careers/:jobId/apply  → JobApplicationPage (public)
```

Protected routes redirect to `/login` if the user is not authenticated.

---

## State Management

HRMS uses **React Context + hooks** — no Redux or external state library.

| Context             | What it holds                                    |
| ------------------- | ------------------------------------------------ |
| `UserContext`       | Current user object, `setUser`, loading state    |
| `ThemeContext`      | `theme` (`light`/`dark`), `toggleTheme`          |
| `AlertContext`      | `showAlert(message, severity)` for global toasts |
| `SocketContext`     | Connected Socket.IO instance                     |
| `ChatUnreadContext` | Total unread message count for badge display     |

Local form state is managed by **Formik** with **Zod** schema validation.

---

## HTTP Client

**File:** `src/core/http/axiosConfig.ts`

The Axios instance is pre-configured with:

- Base URL from `VITE_API_STRING` environment variable
- `withCredentials: true` (sends the httpOnly refresh token cookie)
- 30-second timeout

### Request interceptor

Before every request:

1. Reads the access token from memory.
2. If the token is expiring within 60 seconds, proactively calls `POST /api/refresh-token`.
3. Attaches the (possibly refreshed) token as `Authorization: Bearer <token>`.
4. Concurrent refresh calls share a single promise — only one refresh request is sent.

### Response interceptor

On a `401 Unauthorized` response:

1. Calls `POST /api/refresh-token` to get a new access token.
2. Retries the original request once with the new token.
3. If refresh also fails, redirects to `/login`.

### Visibility change refresh

When the user returns to a hidden tab (`visibilitychange` event), the interceptor checks token expiry and proactively refreshes if needed.

---

## Authentication UI Flow

1. User visits `/login` → `LoginPage` renders `features/auth/`.
2. User enters email → `POST /api/webauthn-credential-check`.
3. **Passkey enrolled:** Browser shows biometric prompt → `POST /api/webauthn-verify-login` → tokens issued.
4. **No passkey:** `POST /api/auth/google` → redirect to Google consent → callback → tokens issued.
5. Tokens stored: access token in memory, refresh token in httpOnly cookie (auto-handled by browser).
6. App navigates to `/dashboard`.

---

## Feature Module Structure

Each feature directory typically contains:

```
features/leave/
├── components/              # Feature-specific components
│   ├── LeaveApplicationForm.tsx
│   ├── LeaveTable.tsx
│   └── LeaveBalanceCard.tsx
├── hooks/                   # Feature-specific hooks
│   └── useLeaveData.ts
├── api/                     # Axios calls for this domain
│   └── leaveApi.ts
└── index.tsx                # Feature entry point (page component)
```

---

## Build Pipeline

The frontend build runs these steps in order:

1. **`build:wasm`** — Compile any WebAssembly modules
2. **`vite build`** — Bundle, tree-shake, and code-split the React app
3. **`optimize-images`** — Generate responsive WebP/AVIF variants with `sharp`
4. **`workbox injectManifest`** — Inject the service worker precache manifest
5. **`optimize-css-loading`** — Convert blocking `<link>` tags to preloaded async CSS
6. **`purge-css`** — Strip unused CSS from output bundles

Output: `apps/web/dist/`

### Code splitting

React Router + dynamic `import()` splits the bundle by route. Each feature page is a separate chunk loaded on navigation.

### Bundle analysis

```bash
cd apps/web && pnpm analyze
```

Opens a visual treemap of the bundle (rollup-plugin-visualizer).

---

## Theming

- MUI `ThemeProvider` and PrimeReact themes are kept in sync.
- User preference (`light`/`dark`) is persisted in `localStorage`.
- `ThemeContext` exposes `toggleTheme()` called from the topbar.
- CSS custom properties are used for values that PrimeReact components consume.

---

## Real-time Integration

Socket.IO is initialized once in `SocketContext` on login and torn down on logout.

**Chat events** (`chat` namespace):

- `send_message` — emit a new message
- `message_sent` — receive messages in a room
- `typing` / `stop_typing` — typing indicators
- `message_deleted` — real-time deletion
- `read_receipt` — mark messages as read

**Notification events** (`notifications` namespace):

- `new_notification` — in-app notification badge updates
- `notification_cleared` — badge count decremented

See [Real-time Features](Real-time-Features) for the server-side setup.

---

## Environment Variables

| Variable                | Purpose                             |
| ----------------------- | ----------------------------------- |
| `VITE_API_STRING`       | API gateway base URL                |
| `VITE_SOCKET_URL`       | Socket.IO server URL                |
| `VITE_FIREBASE_CONFIG`  | Firebase config (JSON) for FCM      |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID (for prompt) |
