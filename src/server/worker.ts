import type { Env, AuthRequest } from './types';

export { AuthDurableObject } from './auth-do';

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Health check
    if (url.pathname === '/api/health') {
      return json({ ok: true });
    }

    // Auth endpoint -- delegates to Durable Object for sequential processing
    if (url.pathname === '/api/auth' && request.method === 'POST') {
      try {
        const body = (await request.json()) as AuthRequest;

        if (!body.room?.customId) {
          return json({ error: 'room.customId is required' }, 400);
        }
        if (!body.participant?.customId) {
          return json({ error: 'participant.customId is required' }, 400);
        }
        if (!body.room?.name) {
          return json({ error: 'room.name is required' }, 400);
        }
        if (!body.participant?.name) {
          return json({ error: 'participant.name is required' }, 400);
        }

        // Route to DO keyed by room customId to serialize requests for the same room
        const doId = env.AUTH_DO.idFromName(body.room.customId);
        const stub = env.AUTH_DO.get(doId);

        const doResponse = await stub.fetch('http://do/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const result = await doResponse.json();
        return json(result, doResponse.status);
      } catch (e) {
        console.error('[worker] /api/auth error:', e);
        const message = e instanceof Error ? e.message : 'Internal server error';
        return json({ error: message }, 500);
      }
    }

    // Serve static assets for all other routes
    return env.ASSETS.fetch(request);
  },
};
