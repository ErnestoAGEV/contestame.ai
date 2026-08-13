import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { createSession } from '../voice/callSession.js';
import { addItem, setOrderType, setDeliveryAddress, setCustomerName } from '../voice/realtimeTools.js';
import { listOrders, createOrderFromSession, updateOrderStatus, isValidStatus } from './orders.service.js';

beforeEach(async () => {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
});

describe('isValidStatus', () => {
  it('accepts known statuses', () => {
    expect(isValidStatus('preparando')).toBe(true);
  });

  it('rejects unknown statuses', () => {
    expect(isValidStatus('cancelado')).toBe(false);
  });
});

describe('createOrderFromSession + listOrders', () => {
  it('persists an order with its items and lists it back', async () => {
    const session = createSession('CA-order-1');
    addItem(session, { name: 'Taco de asada', quantity: 2, notes: 'sin cebolla' });
    setOrderType(session, { type: 'delivery' });
    setDeliveryAddress(session, { address: 'Av. Reforma 123' });
    setCustomerName(session, { name: 'Juan' });

    const created = await createOrderFromSession(session);
    expect(created.status).toBe('recibido');
    expect(created.items).toHaveLength(1);

    const all = await listOrders();
    expect(all).toHaveLength(1);
    expect(all[0].customerName).toBe('Juan');
    expect(all[0].address).toBe('Av. Reforma 123');
  });

  it('lists most recent orders first', async () => {
    const first = createSession('CA-order-1');
    addItem(first, { name: 'Taco de asada', quantity: 1 });
    setOrderType(first, { type: 'pickup' });
    const firstOrder = await createOrderFromSession(first);

    const second = createSession('CA-order-2');
    addItem(second, { name: 'Taco de pastor', quantity: 1 });
    setOrderType(second, { type: 'pickup' });
    const secondOrder = await createOrderFromSession(second);

    const all = await listOrders();
    expect(all[0].id).toBe(secondOrder.id);
    expect(all[1].id).toBe(firstOrder.id);
  });
});

describe('updateOrderStatus', () => {
  it('updates the status of an existing order', async () => {
    const session = createSession('CA-order-1');
    addItem(session, { name: 'Taco de asada', quantity: 1 });
    setOrderType(session, { type: 'pickup' });
    const order = await createOrderFromSession(session);

    const updated = await updateOrderStatus(order.id, 'preparando');
    expect(updated.status).toBe('preparando');
  });
});
