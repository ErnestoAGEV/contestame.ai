import type { FastifyInstance } from 'fastify';

export async function twilioRoutes(fastify: FastifyInstance) {
  fastify.post('/voice', async (request, reply) => {
    const host = request.headers.host;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${host}/media-stream" />
  </Connect>
</Response>`;
    reply.type('text/xml').send(twiml);
  });
}
