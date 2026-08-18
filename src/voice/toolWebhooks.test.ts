import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { prisma } from '../lib/prisma.js';
import { socketPlugin } from '../realtime-events/socket.js';
import { toolWebhookRoutes } from './toolWebhooks.js';

async function buildTestServer() {
  const app = Fastify();
  await app.register(socketPlugin);
  await app.register(toolWebhookRoutes);
  return app;
}

async function post(
  app: Awaited<ReturnType<typeof buildTestServer>>,
  url: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>
) {
  return app.inject({ method: 'POST', url, payload: body, headers });
}

beforeEach(async () => {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
});

describe('POST /tools/add-item', () => {
  it('adds a valid menu item to the conversation session', async () => {
    const app = await buildTestServer();
    const res = await post(app, '/tools/add-item', {
      conversation_id: 'conv-add-1',
      name: 'Taco de asada',
      quantity: 2,
      notes: 'sin cebolla',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    await app.close();
  });

  it('rejects an item not on the menu without failing the request', async () => {
    const app = await buildTestServer();
    const res = await post(app, '/tools/add-item', {
      conversation_id: 'conv-add-2',
      name: 'Pizza hawaiana',
      quantity: 1,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(false);
    await app.close();
  });

  it('returns 400 when conversation_id is missing', async () => {
    const app = await buildTestServer();
    const res = await post(app, '/tools/add-item', { name: 'Taco de asada', quantity: 1 });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('full order flow through the tool webhooks', () => {
  it('persists the order and it shows up in the DB after finalize', async () => {
    const app = await buildTestServer();
    const conversation_id = 'conv-flow-1';

    await post(app, '/tools/add-item', { conversation_id, name: 'Taco de asada', quantity: 3, notes: 'con todo' });
    await post(app, '/tools/set-order-type', { conversation_id, type: 'delivery' });
    await post(app, '/tools/set-delivery-address', { conversation_id, address: 'Av. Reforma 123' });
    await post(app, '/tools/set-customer-name', { conversation_id, name: 'Juan' });

    const finalize = await post(app, '/tools/finalize-order', { conversation_id });
    expect(finalize.statusCode).toBe(200);
    expect(finalize.json().ok).toBe(true);
    expect(finalize.json().orderId).toBeTypeOf('number');

    const orders = await prisma.order.findMany({ include: { items: true } });
    expect(orders).toHaveLength(1);
    expect(orders[0].customerName).toBe('Juan');
    expect(orders[0].type).toBe('delivery');
    expect(orders[0].address).toBe('Av. Reforma 123');
    expect(orders[0].items).toHaveLength(1);
    expect(orders[0].items[0].quantity).toBe(3);
    await app.close();
  });

  it('finalize fails (ok:false) when the order is incomplete', async () => {
    const app = await buildTestServer();
    const conversation_id = 'conv-flow-2';
    await post(app, '/tools/add-item', { conversation_id, name: 'Taco de asada', quantity: 1 });
    // no order type set

    const finalize = await post(app, '/tools/finalize-order', { conversation_id });
    expect(finalize.statusCode).toBe(200);
    expect(finalize.json().ok).toBe(false);
    expect(await prisma.order.count()).toBe(0);
    await app.close();
  });

  it('set-delivery-address is rejected before order type is delivery', async () => {
    const app = await buildTestServer();
    const conversation_id = 'conv-flow-3';
    const res = await post(app, '/tools/set-delivery-address', { conversation_id, address: 'Av. Reforma 123' });
    expect(res.json().ok).toBe(false);
    await app.close();
  });
});

describe('tool webhook auth', () => {
  afterEach(() => {
    delete process.env.TOOLS_WEBHOOK_SECRET;
  });

  it('rejects requests with a wrong/missing secret when TOOLS_WEBHOOK_SECRET is set', async () => {
    process.env.TOOLS_WEBHOOK_SECRET = 's3cret';
    const app = await buildTestServer();

    const noHeader = await post(app, '/tools/add-item', {
      conversation_id: 'conv-auth-1',
      name: 'Taco de asada',
      quantity: 1,
    });
    expect(noHeader.statusCode).toBe(401);

    const goodHeader = await post(
      app,
      '/tools/add-item',
      { conversation_id: 'conv-auth-2', name: 'Taco de asada', quantity: 1 },
      { 'x-tools-secret': 's3cret' }
    );
    expect(goodHeader.statusCode).toBe(200);
    await app.close();
  });
});
