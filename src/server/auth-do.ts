import type { CollabKitRoom, CollabKitUser, ServerResponse } from '@collab-kit/utils';
import type { Env, AuthRequest, AuthResponse } from './types';

/**
 * AuthDurableObject serializes auth requests per room.
 *
 * Because all requests for the same room.customId are routed to the same DO instance,
 * and a DO processes requests one at a time, this prevents race conditions when
 * multiple users join simultaneously.
 */
export class AuthDurableObject implements DurableObject {
  private env: Env;

  constructor(_state: DurableObjectState, env: Env) {
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as AuthRequest;
      const result = await handleAuth(body, this.env);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      console.error('[auth-do] Error:', e);
      const message = e instanceof Error ? e.message : 'Auth failed';
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
}

/**
 * Shared auth logic used by both the DO (production) and the Worker (local dev).
 */
export async function handleAuth(body: AuthRequest, env: Env): Promise<AuthResponse> {
  const bearerToken = btoa(`${env.COLLABKIT_ACCOUNT_ID}:${env.COLLABKIT_API_KEY}`);
  const baseUrl = `${env.COLLABKIT_SERVER_URL}/v1/accounts/${env.COLLABKIT_ACCOUNT_ID}`;

  // Step 1: Find or create room
  const room = await findOrCreateRoom(body.room, baseUrl, bearerToken);

  // Step 2: Find or create user in that room
  const user = await findOrCreateUser(body.participant, room.id, baseUrl, bearerToken);

  return { user, room };
}

async function findOrCreateRoom(
  roomInput: AuthRequest['room'],
  baseUrl: string,
  bearerToken: string
): Promise<CollabKitRoom> {
  const findRes = await fetch(
    `${baseUrl}/rooms/custom/${encodeURIComponent(roomInput.customId)}`,
    { headers: { Authorization: `Bearer ${bearerToken}` } }
  );

  if (findRes.ok) {
    const data = (await findRes.json()) as ServerResponse<{ room: CollabKitRoom }>;
    return data.data.room;
  }

  if (findRes.status !== 404) {
    const err = await findRes.text();
    throw new Error(`Failed to look up room: ${findRes.status} ${err}`);
  }

  // Room not found -- create it
  const createRes = await fetch(`${baseUrl}/rooms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: roomInput.name,
      customId: roomInput.customId,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create room: ${createRes.status} ${err}`);
  }

  const createData = (await createRes.json()) as ServerResponse<{ room: CollabKitRoom }>;
  return createData.data.room;
}

async function findOrCreateUser(
  participantInput: AuthRequest['participant'],
  roomId: string,
  baseUrl: string,
  bearerToken: string
): Promise<CollabKitUser> {
  // Try to find existing user by custom ID
  const findRes = await fetch(
    `${baseUrl}/users/custom/${encodeURIComponent(participantInput.customId)}?roomId=${encodeURIComponent(roomId)}`,
    { headers: { Authorization: `Bearer ${bearerToken}` } }
  );

  if (findRes.ok) {
    // GET user response: token is inside user.token
    const data = (await findRes.json()) as ServerResponse<{ user: CollabKitUser }>;
    return data.data.user;
  }

  if (findRes.status !== 404) {
    const err = await findRes.text();
    throw new Error(`Failed to look up user: ${findRes.status} ${err}`);
  }

  // User not found -- create them
  const createRes = await fetch(`${baseUrl}/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: participantInput.name,
      roomId,
      customId: participantInput.customId,
      profilePicture: participantInput.profilePicture,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create user: ${createRes.status} ${err}`);
  }

  // POST user response: CreateUserHttpResponse has { user, token }
  // token is at data.data.token AND data.data.user.token
  const createData = (await createRes.json()) as ServerResponse<{ user: CollabKitUser; token: string }>;
  return createData.data.user;
}
