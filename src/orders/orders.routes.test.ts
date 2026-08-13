import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { prisma } from '../lib/prisma.js';
import { socketPlugin } from '../realtime-events/socket.js';
import { ordersRoutes } from './orders.routes.js';
import { createSession } from '../voice/callSession.js';
import { addItem, setOrderType } from '../voice/realtimeTools.js';
import { createOrderFromSession } from './orders.service.js';

async function buildTestServer() {
  const app = Fastify();
  await app.register(socketPlugin);
  await app.register(ordersRoutes);
  return app;
}

beforeEach(async () => {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
});

describe('GET /api/orders', () => {
  it('returns an empty list when there are no orders', async () => {
    const app = await buildTestServer();
    const response = await app.inject({ method: 'GET', url: '/api/orders' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
    await app.close();
  });
});

describe('PATCH /api/orders/:id/status', () => {
  it('updates status for an existing order', async () => {
    const app = await buildTestServer();
    const session = createSession('CA-route-1');
    addItem(session, { name: 'Taco de asada', quantity: 1 });
    setOrderType(session, { type: 'pickup' });
    const order = await createOrderFromSession(session);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/orders/${order.id}/status`,
      payload: { status: 'preparando' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('preparando');
    await app.close();
  });

  it('returns 400 for an invalid status', async () => {
    const app = await buildTestServer();
    const session = createSession('CA-route-2');
    addItem(session, { name: 'Taco de asada', quantity: 1 });
    setOrderType(session, { type: 'pickup' });
    const order = await createOrderFromSession(session);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/orders/${order.id}/status`,
      payload: { status: 'cancelado' },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns 404 for a non-existent order', async () => {
    const app = await buildTestServer();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/orders/999999/status',
      payload: { status: 'preparando' },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
