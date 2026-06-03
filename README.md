# Whiteboard

Collaborative whiteboard powered by [tldraw v5](https://tldraw.dev) and [CollabKit](https://collabkit.mintlify.app).

## Architecture

The application has two sections:

- **Client** -- A React SPA using tldraw v5 for the canvas and `@collab-kit/client` for real-time collaboration. Built with Vite and served as static assets by the Cloudflare Worker.
- **Server** -- A Cloudflare Worker with a Durable Object that acts as an auth proxy to the CollabKit API. The Durable Object ensures all auth requests for the same room are processed sequentially, preventing duplicate room/user creation when multiple users open the app simultaneously.

```
Client (Browser)                    Server (CF Worker + DO)              CollabKit API
┌──────────────┐   POST /api/auth   ┌─────────────────────┐   REST     ┌──────────────┐
│  React App   │ ─────────────────▶ │  Worker → DO        │ ────────▶ │  Rooms/Users │
│  tldraw v5   │ ◀───── JWT ─────── │  (per room.customId)│ ◀──────── │  JWT tokens  │
│  CollabKit   │                    └─────────────────────┘            └──────────────┘
│  Client SDK  │ ═══ WebSocket ═══════════════════════════════════════▶ CollabKit Server
└──────────────┘   (presence, stores, users)
```

## Install and Setup

### Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- A [CollabKit](https://collab-kit-dashboard.ishitakabra18.workers.dev) account (for Account ID and API Key)

### Install dependencies

```bash
npm install
```

### Configure secrets

Set your CollabKit credentials as Wrangler secrets (required for deployment):

```bash
wrangler secret put COLLABKIT_ACCOUNT_ID
wrangler secret put COLLABKIT_API_KEY
```

For local development, create a `.dev.vars` file in the project root:

```
COLLABKIT_ACCOUNT_ID=your-account-id
COLLABKIT_API_KEY=your-api-key
```

## Run

### Development

Requires a `.dev.vars` file with `COLLABKIT_ACCOUNT_ID` and `COLLABKIT_API_KEY` 

```bash
npm run dev
```


### Development (Cloudflare Worker)

Builds the client, then starts Wrangler in dev mode. This runs the Worker (with the Durable Object) and serves the static assets locally via Miniflare. 

Note: outbound `fetch()` from Miniflare may be restricted on some machines. Use `npm run dev` if you encounter networking issues.

```bash
npm run cf:dev
```

### Preview

Preview the production build locally via Vite.

```bash
npm run preview
```



## Deploy

This runs `tsc && vite build` followed by `wrangler deploy`. Deploys both the Worker (with the Durable Object) and the static client assets to Cloudflare.

Make sure your secrets (`COLLABKIT_ACCOUNT_ID`, `COLLABKIT_API_KEY`) are set before deploying.

```bash
npm run cf:deploy
```

## Usage

Open the app with URL query parameters to specify the room and participant:

```
https://your-worker.your-subdomain.workers.dev?roomId=<uuid>&roomName=<name>&userId=<uuid>&userName=<name>
```

| Parameter  | Required | Description                          |
|------------|----------|--------------------------------------|
| `roomId`   | No       | Custom UUID for the room. Defaults to `default-room`. |
| `roomName` | No       | Display name for the room. Defaults to `Whiteboard`. |
| `userId`   | No       | Custom UUID for the participant. Defaults to a timestamp-based ID. |
| `userName` | No       | Display name for the participant. Defaults to `Participant`. |
| `profilePicture` | No | URL of the participant's avatar image. |

If the room doesn't exist, it is created automatically. If the user doesn't exist in that room, they are created automatically. The server returns a JWT token which the client uses to connect to CollabKit.

## Features

| Feature | Description |
|---------|-------------|
| Real-Time Collaborative Drawing | Full tldraw v5 canvas with all built-in tools, synced in real time via CollabKit stores. |
| Cursor Presence | Live cursors, selections, and viewport indicators for all participants. |
| Online User List | Colored avatar circles with initials; up to 3 inline with a "more" dropdown. |
| Follow Mode | Lock your camera to another user's viewport with automatic screen-size adjustment. |
| Multi-Page Support | Create, switch, and delete pages; state syncs across all participants. |
| Image Upload | Drag, paste, or insert images; stored in CollabKit R2 storage. |
| Viewer/Editor Roles | Configurable via `config.role`; viewers can observe but not modify the canvas. |
| Auto-Scale (Zoom-to-Fit) | Viewport auto-zooms to fit all content; clamped to 25% min on small screens. |
| Bounded Canvas | Constrains camera and shapes to viewport when `config.canvas.infinite` is `false`. |
| Tool Locking | Selected tool stays active after creating a shape instead of reverting to select. |
| Dark Mode | Native tldraw dark theme with adapted custom UI components. |
| Zen Mode | Hides auto-scale toggle and follow badge labels for a distraction-free canvas. |
| Error Handling | Dismissible error modal for connection failures, asset upload errors, etc. |
| Export (via Workflow) | Board export via a CollabKit workflow triggered on `session.closed`; see [Export](#export-via-collabkit-workflow). |

### Export (via CollabKit Workflow)

> **Note:** The export service is not included in this project. You need to build and host it yourself. The service should accept the store data and files, render the whiteboard content (e.g., using tldraw's export APIs to generate images/PDFs), and return the result. If you have renamed the store from `"document"` to something else in `src/client/collabkit.ts`, update the `env.STORE.list()` call in the workflow to match.


Can be handled by a CollabKit workflow triggered on `session.closed`. Workflows have access to the room's store data, files, and metadata via environment bindings. You must build your own export service (e.g., using [tldraw's export APIs](https://tldraw.dev) or a Playwright-based renderer) and replace the placeholder URL below with your service endpoint.

```javascript
// Workflow code (runs on session.closed)
export default {
  async fetch(request, env) {
    // 1. Read the store data via the STORE binding
    //    "document" matches the store name defined in src/client/collabkit.ts
    const storeData = await env.STORE.list("document");

    // 2. Read any files via the FILES binding
    const files = await env.FILES.list();

    // 3. Call your own external export service
    //    Replace this URL with your actual service endpoint
    const response = await fetch("https://customer-export-service.example.com/export-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeData,
        files,
        // room metadata from ROOM binding, event info from EVENT binding
        room: await env.ROOM.getRoom(),
        event: await env.EVENT.getEvent(),
      }),
    });

    return new Response(response.ok ? "PDF export triggered" : "Export failed", {
      status: response.status,
    });
  },
};
```


## Whiteboard Config

All features are controlled by the `WhiteboardConfig` object defined in `src/client/config.ts`. Edit the `defaultConfig` export to change the behavior:

```typescript
export interface WhiteboardConfig {
  role: 'editor' | 'viewer';
  canvas: {
    autoScale: boolean;
    infinite: boolean;
  };
  tools: {
    defaultSelected: TldrawTool;
    lockTools: boolean;
  };
  settings: {
    zen: boolean;
    theme: 'dark' | 'light';
  };
}
```

### `role`

| Value      | Effect |
|------------|--------|
| `'editor'` | Full read-write access. Can draw, edit, delete shapes. All tools available. |
| `'viewer'` | Read-only mode. Can pan, zoom, select, and follow users, but cannot modify the canvas. Toolbar shows only select, hand, and laser tools. |

### `canvas.autoScale`

| Value   | Effect |
|---------|--------|
| `true`  | Viewport auto-zooms to fit all content on every shape change. Clamped to a minimum zoom of 25% on small screens. Disabled while following a user. |
| `false` | Manual zoom only. |

### `canvas.infinite`

| Value   | Effect |
|---------|--------|
| `true`  | Infinite canvas. Users can pan in any direction without bounds. |
| `false` | Bounded canvas. Camera is constrained to the viewport. Shapes cannot be dragged outside the visible area. |

### `tools.defaultSelected`

The tool that is active when the editor first loads. One of:

| Value         | Tool |
|---------------|------|
| `'select'`    | Selection tool |
| `'hand'`      | Pan/hand tool |
| `'draw'`      | Freehand draw (pen) |
| `'eraser'`    | Eraser |
| `'text'`      | Text tool |
| `'note'`      | Sticky note |
| `'laser'`     | Laser pointer |
| `'highlight'` | Highlighter |
| `'geo'`       | Geometric shapes (rectangle, ellipse, triangle, etc.) |

### `tools.lockTools`

| Value   | Effect |
|---------|--------|
| `true`  | After creating a shape, the current tool stays selected. You can draw multiple shapes without re-selecting the tool each time. |
| `false` | After creating a shape, the editor reverts to the select tool. |

### `settings.zen`

| Value   | Effect |
|---------|--------|
| `true`  | Hides the auto-scale toggle and follow badge labels. Minimal UI for focused viewing. |
| `false` | Full UI with all controls visible. |

### `settings.theme`

| Value     | Effect |
|-----------|--------|
| `'light'` | Light theme. White canvas background, dark text. |
| `'dark'`  | Dark theme. Dark canvas background (#353D43), light text. All custom UI components adapt. |



## Project Structure

```
src/
├── client/                          # React frontend (Vite)
│   ├── main.tsx                     # Entry point
│   ├── App.tsx                      # Bootstrap: auth -> CollabKit -> tldraw
│   ├── config.ts                    # WhiteboardConfig type and defaults
│   ├── collabkit.ts                 # Store schemas and auth helper
│   ├── context/index.tsx            # React context provider
│   ├── features/
│   │   ├── canvas.ts               # Editor init, theme, readonly, tool lock
│   │   ├── sync.ts                 # tldraw <-> CollabKit store sync (diffs + snapshots)
│   │   ├── presence.ts             # Cursor/camera presence bridging
│   │   ├── users.ts                # Online user tracking
│   │   ├── follow.ts               # Follow/unfollow with screen-size zoom calc
│   │   ├── pagination.ts           # Multi-page sync
│   │   ├── images.ts               # Image upload/delete via CollabKit storage
│   │   ├── auto-scale.ts           # Zoom-to-fit with min zoom clamp
│   │   └── bounded-canvas.ts       # Camera constraints
│   ├── components/                  # UI components
│   └── utils/                       # Shared helpers
└── server/
    ├── worker.ts                    # Cloudflare Worker entry
    ├── auth-do.ts                   # Durable Object for sequential auth
    └── types.ts                     # Shared TypeScript types
```

## Server API

### `POST /api/auth`

Provisions a room and user in CollabKit. Returns a JWT token for the client SDK.

**Request:**
```json
{
  "room": {
    "customId": "uuid-string",
    "name": "My Whiteboard"
  },
  "participant": {
    "customId": "uuid-string",
    "name": "Alice",
    "profilePicture": "https://example.com/avatar.png"
  }
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": "...", "name": "Alice", "status": "offline" },
  "room": { "id": "...", "name": "My Whiteboard" }
}
```

All requests for the same `room.customId` are serialized through a single Durable Object instance, preventing race conditions when multiple users join simultaneously.

### `GET /api/health`

Returns `{ "ok": true }`.

### CORS

All API responses include `Access-Control-Allow-Origin: *` headers. Preflight `OPTIONS` requests are handled automatically.
