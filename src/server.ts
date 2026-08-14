import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyError } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { socketPlugin } from './realtime-events/socket.js';
import { ordersRoutes } from './orders/orders.routes.js';
import { twilioRoutes } from './voice/twilioRoutes.js';
import { realtimeBridgeRoute } from './voice/realtimeBridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({ logger: true });

process.on('unhandledRejection', (err) => {
  fastify.log.error(err, 'unhandledRejection');
});

process.on('uncaughtException', (err) => {
  fastify.log.error(err, 'uncaughtException');
  process.exit(1);
});

await fastify.register(fastifyWebsocket);
await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/',
});
await fastify.register(socketPlugin);
await fastify.register(ordersRoutes);
await fastify.register(twilioRoutes);
await fastify.register(realtimeBridgeRoute);

fastify.setErrorHandler((error: FastifyError, _request, reply) => {
  fastify.log.error(error);
  reply.status(error.statusCode ?? 500).send({ error: error.message ?? 'internal server error' });
});

const port = Number(process.env.PORT ?? 3000);

fastify.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
