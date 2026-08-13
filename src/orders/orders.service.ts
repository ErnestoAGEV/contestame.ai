import type { OrderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { CallSession } from '../voice/callSession.js';

export async function listOrders() {
  return prisma.order.findMany({
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createOrderFromSession(session: CallSession) {
  return prisma.order.create({
    data: {
      customerName: session.customerName,
      type: session.type!,
      address: session.address,
      items: {
        create: session.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          notes: item.notes,
        })),
      },
    },
    include: { items: true },
  });
}

const VALID_STATUSES: OrderStatus[] = ['recibido', 'preparando', 'listo', 'completado'];

export function isValidStatus(status: string): status is OrderStatus {
  return (VALID_STATUSES as string[]).includes(status);
}

export async function updateOrderStatus(id: number, status: OrderStatus) {
  return prisma.order.update({
    where: { id },
    data: { status },
    include: { items: true },
  });
}
