import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import type { Order, OrderItem } from '@prisma/client';

type OrderWithItems = Order & { items: OrderItem[] };

declare module 'fastify' {
  interface FastifyInstance {
    io: SocketIOServer;
    emitOrderNew: (order: OrderWithItems) => void;
    emitOrderUpdated: (order: OrderWithItems) => void;
  }
}

async function socketPluginImpl(fastify: FastifyInstance) {
  const io = new SocketIOServer(fastify.server, {
    cors: { origin: '*' },
  });

  fastify.decorate('io', io);
  fastify.decorate('emitOrderNew', (order: OrderWithItems) => {
    io.emit('order:new', order);
  });
  fastify.decorate('emitOrderUpdated', (order: OrderWithItems) => {
    io.emit('order:updated', order);
  });

  fastify.addHook('onClose', (_instance, done) => {
    io.close();
    done();
  });
}

export const socketPlugin = fp(socketPluginImpl);
