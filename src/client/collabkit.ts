import { defineStores } from '@collab-kit/utils';
import type { CollabKitRoom, CollabKitUser } from '@collab-kit/utils';

/**
 * CollabKit store schemas for whiteboard sync.
 *
 * - `document`: Each entry key is a tldraw record ID (shape:xxx, binding:xxx, asset:xxx, page:xxx).
 *   The value.data field is the JSON-stringified TLRecord.
 *   When a shape is created/updated, we set the entry. When deleted, we delete it.
 *   The store always has exactly one entry per live record.
 *
 * - `pages`: Application-level page metadata (e.g., currentPage tracking).
 *   Not for tldraw page records (those go in `document`), but for the pagination UI.
 */
export const storeSchemas = defineStores({
  document: {
    data: { type: 'string', required: true },
  },
  pages: {
    data: { type: 'string', required: true },
  },
});

export const COLLABKIT_SERVER_URL =
  'https://collab-kit-server.ishitakabra18.workers.dev';

export interface AuthResult {
  user: CollabKitUser;
  room: CollabKitRoom;
}

export async function authenticate(params: {
  serverUrl: string;
  room: { customId: string; name: string };
  participant: { customId: string; name: string; profilePicture?: string };
}): Promise<AuthResult> {
  const res = await fetch(`${params.serverUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room: params.room,
      participant: params.participant,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Auth request failed' }));
    throw new Error((err as { error?: string }).error || `Auth failed: ${res.status}`);
  }

  const data = (await res.json()) as AuthResult;
  if (!data.user?.token) {
    throw new Error('Auth response missing user.token');
  }
  return data;
}
