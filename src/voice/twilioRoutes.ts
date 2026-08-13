import type { FastifyInstance } from 'fastify';
import { escapeXml } from './twilioCallControl.js';

export async function twilioRoutes(fastify: FastifyInstance) {
  fastify.post('/voice', async (request, reply) => {
    const host = process.env.PUBLIC_HOST ?? request.headers.host;

    if (!host) {
      return reply.code(400).send({ error: 'No se pudo determinar el host público' });
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${escapeXml(host)}/media-stream" />
  </Connect>
</Response>`;
    reply.type('text/xml').send(twiml);
  });
}
