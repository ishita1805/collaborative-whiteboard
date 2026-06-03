import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

/**
 * Vite plugin that handles /api/* routes during local dev.
 * Replicates the Worker's auth logic using Node.js native fetch,
 * bypassing Miniflare's outbound fetch restrictions.
 *
 * In production, the Cloudflare Worker + Durable Object handles these routes.
 */
function localApiPlugin(): Plugin {
  let collabkitServerUrl = '';
  let collabkitAccountId = '';
  let collabkitApiKey = '';

  return {
    name: 'local-api',
    configureServer(server) {
      // Load env vars from .dev.vars (same file Wrangler uses)
      const fs = require('fs');
      const path = require('path');
      const devVarsPath = path.resolve(process.cwd(), '.dev.vars');

      if (fs.existsSync(devVarsPath)) {
        const content = fs.readFileSync(devVarsPath, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIndex = trimmed.indexOf('=');
          if (eqIndex === -1) continue;
          const key = trimmed.slice(0, eqIndex).trim();
          const value = trimmed.slice(eqIndex + 1).trim();
          if (key === 'COLLABKIT_ACCOUNT_ID') collabkitAccountId = value;
          if (key === 'COLLABKIT_API_KEY') collabkitApiKey = value;
          if (key === 'COLLABKIT_SERVER_URL') collabkitServerUrl = value;
        }
      }

      if (!collabkitServerUrl) {
        collabkitServerUrl = 'https://collab-kit-server.ishitakabra18.workers.dev';
      }

      // Health endpoint
      server.middlewares.use('/api/health', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ ok: true }));
      });

      // Auth endpoint
      server.middlewares.use('/api/auth', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        // Read request body
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const rawBody = Buffer.concat(chunks).toString('utf-8');

        try {
          const body = JSON.parse(rawBody);

          if (!body.room?.customId || !body.room?.name || !body.participant?.customId || !body.participant?.name) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing required fields' }));
            return;
          }

          if (!collabkitAccountId || !collabkitApiKey) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Missing COLLABKIT_ACCOUNT_ID or COLLABKIT_API_KEY in .dev.vars' }));
            return;
          }

          const bearerToken = Buffer.from(`${collabkitAccountId}:${collabkitApiKey}`).toString('base64');
          const baseUrl = `${collabkitServerUrl}/v1/accounts/${collabkitAccountId}`;

          // Step 1: Find or create room
          const room = await findOrCreateRoom(body.room, baseUrl, bearerToken);

          // Step 2: Find or create user (token lives inside user.token)
          const user = await findOrCreateUser(body.participant, room.id, baseUrl, bearerToken);

          res.statusCode = 200;
          res.end(JSON.stringify({ user, room }));
        } catch (err: any) {
          console.error('[vite-api] Auth error:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message || 'Auth failed' }));
        }
      });
    },
  };
}

async function findOrCreateRoom(
  roomInput: { customId: string; name: string },
  baseUrl: string,
  bearerToken: string
) {
  const findRes = await fetch(
    `${baseUrl}/rooms/custom/${encodeURIComponent(roomInput.customId)}`,
    { headers: { Authorization: `Bearer ${bearerToken}` } }
  );

  if (findRes.ok) {
    const data = await findRes.json() as any;
    return data.data.room;
  }

  if (findRes.status !== 404) {
    const err = await findRes.text();
    throw new Error(`Failed to look up room: ${findRes.status} ${err}`);
  }

  const createRes = await fetch(`${baseUrl}/rooms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: roomInput.name, customId: roomInput.customId }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create room: ${createRes.status} ${err}`);
  }

  const createData = await createRes.json() as any;
  return createData.data.room;
}

async function findOrCreateUser(
  participantInput: { customId: string; name: string; profilePicture?: string },
  roomId: string,
  baseUrl: string,
  bearerToken: string
) {
  const findRes = await fetch(
    `${baseUrl}/users/custom/${encodeURIComponent(participantInput.customId)}?roomId=${encodeURIComponent(roomId)}`,
    { headers: { Authorization: `Bearer ${bearerToken}` } }
  );

  if (findRes.ok) {
    // GET user: token is inside user.token
    const data = await findRes.json() as any;
    return data.data.user;
  }

  if (findRes.status !== 404) {
    const err = await findRes.text();
    throw new Error(`Failed to look up user: ${findRes.status} ${err}`);
  }

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

  // POST user: CreateUserHttpResponse has { user, token }
  // token is also on user.token
  const createData = await createRes.json() as any;
  return createData.data.user;
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
  server: {
    port: 5000,
  },
  build: {
    outDir: 'dist',
  },
});
