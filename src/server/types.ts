import type { CollabKitRoom, CollabKitUser } from '@collab-kit/utils';

export type { CollabKitRoom, CollabKitUser };

export interface Env {
  ASSETS: Fetcher;
  AUTH_DO: DurableObjectNamespace;
  COLLABKIT_ACCOUNT_ID: string;
  COLLABKIT_API_KEY: string;
  COLLABKIT_SERVER_URL: string;
}

export interface AuthRequest {
  room: {
    customId: string;
    name: string;
  };
  participant: {
    customId: string;
    name: string;
    profilePicture?: string;
  };
}

/**
 * Response returned by our /api/auth endpoint.
 * The token lives inside user.token (as per CollabKit API).
 */
export interface AuthResponse {
  user: CollabKitUser;
  room: CollabKitRoom;
}
