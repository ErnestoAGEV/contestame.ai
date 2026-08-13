import { findMenuItem } from '../config/restaurant.js';
import type { CallSession, OrderType } from './callSession.js';

export interface ToolResult {
  ok: boolean;
  reason?: string;
  [key: string]: unknown;
}

export function addItem(
  session: CallSession,
  args: { name: string; quantity: number; notes?: string }
): ToolResult {
  if (!Number.isInteger(args.quantity) || args.quantity <= 0) {
    return { ok: false, reason: 'la cantidad debe ser un número entero positivo' };
  }
  const menuItem = findMenuItem(args.name);
  if (!menuItem) {
    return { ok: false, reason: `"${args.name}" no está en el menú` };
  }
  session.items.push({ name: menuItem.name, quantity: args.quantity, notes: args.notes });
  return { ok: true, item: menuItem.name, quantity: args.quantity };
}

export function removeItem(session: CallSession, args: { name: string }): ToolResult {
  const normalizedArg = args.name.toLowerCase();

  const exactIndex = session.items.findIndex(
    (item) => item.name.toLowerCase() === normalizedArg
  );
  if (exactIndex !== -1) {
    session.items.splice(exactIndex, 1);
    return { ok: true };
  }

  const candidates = session.items.filter(
    (item) =>
      item.name.toLowerCase().includes(normalizedArg) ||
      normalizedArg.includes(item.name.toLowerCase())
  );
  if (candidates.length !== 1) {
    return { ok: false, reason: `"${args.name}" no estaba en el pedido` };
  }
  const index = session.items.indexOf(candidates[0]);
  session.items.splice(index, 1);
  return { ok: true };
}

export function setOrderType(session: CallSession, args: { type: OrderType }): ToolResult {
  session.type = args.type;
  if (args.type === 'pickup') {
    session.address = undefined;
  }
  return { ok: true, type: args.type };
}

export function setDeliveryAddress(session: CallSession, args: { address: string }): ToolResult {
  if (session.type !== 'delivery') {
    return { ok: false, reason: 'primero hay que fijar el tipo de pedido como delivery' };
  }
  session.address = args.address;
  return { ok: true, address: args.address };
}

export function setCustomerName(session: CallSession, args: { name: string }): ToolResult {
  session.customerName = args.name;
  return { ok: true, name: args.name };
}

export function validateFinalize(session: CallSession): ToolResult {
  if (session.items.length === 0) {
    return { ok: false, reason: 'el pedido no tiene platillos' };
  }
  if (!session.type) {
    return { ok: false, reason: 'falta indicar si es pickup o delivery' };
  }
  if (session.type === 'delivery' && !session.address) {
    return { ok: false, reason: 'falta la dirección de entrega' };
  }
  return { ok: true };
}

export const toolDefinitions = [
  {
    type: 'function',
    name: 'add_item',
    description: 'Agrega un platillo al pedido del cliente.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre del platillo, tal como aparece en el menú' },
        quantity: { type: 'integer', description: 'Cantidad de este platillo' },
        notes: { type: 'string', description: 'Notas especiales, ej. sin cebolla' },
      },
      required: ['name', 'quantity'],
    },
  },
  {
    type: 'function',
    name: 'remove_item',
    description: 'Quita un platillo del pedido del cliente.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre del platillo a quitar' },
      },
      required: ['name'],
    },
  },
  {
    type: 'function',
    name: 'set_order_type',
    description: 'Fija si el pedido es para recoger o entrega a domicilio.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['pickup', 'delivery'] },
      },
      required: ['type'],
    },
  },
  {
    type: 'function',
    name: 'set_delivery_address',
    description: 'Fija la dirección de entrega. Solo válido si el pedido es delivery.',
    parameters: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Dirección completa de entrega' },
      },
      required: ['address'],
    },
  },
  {
    type: 'function',
    name: 'set_customer_name',
    description: 'Fija el nombre del cliente que hace el pedido.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    type: 'function',
    name: 'finalize_order',
    description: 'Confirma y cierra el pedido una vez que el cliente lo aprobó en voz alta.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];
