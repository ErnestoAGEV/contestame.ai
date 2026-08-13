import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { listOrders, updateOrderStatus, isValidStatus } from './orders.service.js';

export async function ordersRoutes(fastify: FastifyInstance) {
  fastify.get('/api/orders', async () => {
    return listOrders();
  });

  fastify.patch<{ Params: { id: string }; Body: { status: string } }>(
    '/api/orders/:id/status',
    async (request, reply) => {
      const id = Number(request.params.id);
      const { status } = request.body;

      if (!isValidStatus(status)) {
        return reply.code(400).send({ error: `status inválido: ${status}` });
      }

      try {
        const order = await updateOrderStatus(id, status);
        fastify.emitOrderUpdated(order);
        return order;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.code(404).send({ error: `pedido ${id} no encontrado` });
        }
        throw err;
      }
    }
  );
}
