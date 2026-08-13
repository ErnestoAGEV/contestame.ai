# Contestame.ai MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working MVP where a phone call to a Twilio number is answered by an OpenAI Realtime voice agent that takes a food order for "Tacos El Compa," and the order appears live on a kanban dashboard.

**Architecture:** Single Fastify process. `@fastify/websocket` handles the Twilio Media Stream connection; a `ws` client bridges that stream to the OpenAI Realtime API, translating audio both ways and dispatching function calls. Call state lives in memory per `callSid` until `finalize_order()` persists it via Prisma/SQLite and broadcasts it to dashboards over socket.io. The dashboard is a static vanilla-JS page served by the same Fastify instance.

**Tech Stack:** Node.js, TypeScript, Fastify 5, `@fastify/websocket`, `@fastify/static`, `ws`, `socket.io`, Prisma + SQLite, Vitest.

---

## Task 1: Project scaffolding and dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.env` (local only, gitignored)

- [ ] **Step 1: Initialize package.json**

Run:
```bash
npm init -y
```

- [ ] **Step 2: Install runtime dependencies**

Run:
```bash
npm install fastify @fastify/websocket @fastify/static fastify-plugin ws socket.io @prisma/client dotenv
```

- [ ] **Step 3: Install dev dependencies**

Run:
```bash
npm install -D typescript tsx @types/node @types/ws prisma vitest
```

- [ ] **Step 4: Replace package.json contents**

```json
{
  "name": "contestame-ai",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "pretest": "node scripts/setup-test-db.mjs",
    "test": "vitest run",
    "prisma:migrate": "prisma migrate dev"
  }
}
```

npm will have already populated `dependencies`/`devDependencies` from Steps 2-3 — keep those, just add/overwrite the fields above (`name`, `type`, `scripts`).

- [ ] **Step 5: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Create .env.example**

```
OPENAI_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
PORT=3000
DATABASE_URL="file:./dev.db"
```

- [ ] **Step 7: Create local .env (not committed)**

Copy `.env.example` to `.env` and fill in real values:
```bash
cp .env.example .env
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json .env.example
git commit -m "chore: scaffold Node/TypeScript/Fastify project"
```

---

## Task 2: Prisma schema, client, and migration

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`

- [ ] **Step 1: Write the Prisma schema**

`prisma/schema.prisma`:
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum OrderType {
  pickup
  delivery
}

enum OrderStatus {
  recibido
  preparando
  listo
  completado
}

model Order {
  id           Int         @id @default(autoincrement())
  customerName String?
  type         OrderType
  address      String?
  status       OrderStatus @default(recibido)
  createdAt    DateTime    @default(now())
  items        OrderItem[]
}

model OrderItem {
  id       Int     @id @default(autoincrement())
  orderId  Int
  order    Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  name     String
  quantity Int
  notes    String?
}
```

- [ ] **Step 2: Run the initial migration**

Run:
```bash
npx prisma migrate dev --name init
```
Expected: creates `prisma/dev.db`, `prisma/migrations/`, and generates the Prisma Client. Command exits 0.

- [ ] **Step 3: Create the Prisma client singleton**

`src/lib/prisma.ts`:
```ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/prisma.ts
git commit -m "feat: add Prisma schema and client for Order/OrderItem"
```

(`prisma/dev.db` and `prisma/test.db` are gitignored via the existing `*.db` rule.)

**Deviation note (2026-08-13):** Task 1's `npm install prisma @prisma/client` pulled in `^7.x`, which dropped support for the classic `datasource { url = env("DATABASE_URL") }` syntax used above — Prisma 7 requires a driver-adapter model (`prisma.config.ts` + an adapter package like `@prisma/adapter-better-sqlite3`). That's unnecessary complexity for this MVP (native bindings, extra config surface), so `prisma`/`@prisma/client` were downgraded to `^6.x` in commit `5e24637`, keeping the schema and `src/lib/prisma.ts` exactly as originally written. If a future task needs a Prisma 7+ feature, revisit this decision deliberately rather than upgrading incidentally.

---

## Task 3: Vitest config and test database setup

**Files:**
- Create: `vitest.config.ts`
- Create: `scripts/setup-test-db.mjs`

- [ ] **Step 1: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      DATABASE_URL: 'file:./prisma/test.db',
    },
  },
});
```

- [ ] **Step 2: Create the test DB setup script**

`scripts/setup-test-db.mjs`:
```js
import { execSync } from 'node:child_process';

execSync('npx prisma db push --skip-generate', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: 'file:./prisma/test.db' },
});
```

This runs automatically before `npm test` (via the `pretest` script from Task 1) and pushes the schema to a dedicated `prisma/test.db`, kept separate from the dev database.

- [ ] **Step 3: Verify the setup script works standalone**

Run:
```bash
node scripts/setup-test-db.mjs
```
Expected: prints Prisma's "db push" success output, creates `prisma/test.db`. Exit code 0.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts scripts/setup-test-db.mjs
git commit -m "test: add Vitest config and dedicated test database setup"
```

---

## Task 4: Restaurant menu config

**Files:**
- Create: `src/config/restaurant.ts`
- Test: `src/config/restaurant.test.ts`

- [ ] **Step 1: Write the failing test**

`src/config/restaurant.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { findMenuItem } from './restaurant.js';

describe('findMenuItem', () => {
  it('finds an exact match case-insensitively', () => {
    const result = findMenuItem('taco de asada');
    expect(result?.name).toBe('Taco de asada');
  });

  it('finds a partial match by substring', () => {
    const result = findMenuItem('pastor');
    expect(result?.name).toBe('Taco de pastor');
  });

  it('returns undefined for dishes not on the menu', () => {
    expect(findMenuItem('pizza hawaiana')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/restaurant.test.ts`
Expected: FAIL — `restaurant.ts` does not exist yet.

- [ ] **Step 3: Write the menu, system prompt, and matching logic**

`src/config/restaurant.ts`:
```ts
export interface MenuItem {
  name: string;
  category: string;
  price: number;
}

export const RESTAURANT_NAME = 'Tacos El Compa';

export const MENU: MenuItem[] = [
  { name: 'Taco de asada', category: 'Tacos', price: 25 },
  { name: 'Taco de pastor', category: 'Tacos', price: 22 },
  { name: 'Taco de bistec', category: 'Tacos', price: 24 },
  { name: 'Quesadilla de queso', category: 'Quesadillas', price: 35 },
  { name: 'Quesadilla de asada', category: 'Quesadillas', price: 45 },
  { name: 'Gringa', category: 'Especialidades', price: 55 },
  { name: 'Orden de guacamole', category: 'Extras', price: 40 },
  { name: 'Refresco', category: 'Bebidas', price: 20 },
  { name: 'Agua de horchata', category: 'Bebidas', price: 25 },
  { name: 'Flan napolitano', category: 'Postres', price: 30 },
];

export function findMenuItem(name: string): MenuItem | undefined {
  const normalized = name.trim().toLowerCase();
  const exact = MENU.find((item) => item.name.toLowerCase() === normalized);
  if (exact) return exact;
  return MENU.find(
    (item) =>
      item.name.toLowerCase().includes(normalized) ||
      normalized.includes(item.name.toLowerCase())
  );
}

export function buildSystemPrompt(): string {
  const menuLines = MENU.map(
    (item) => `- ${item.name} (${item.category}): $${item.price} MXN`
  ).join('\n');

  return `Eres el asistente de voz de ${RESTAURANT_NAME}, un restaurante de comida mexicana. Contestas llamadas para tomar pedidos.

MENÚ:
${menuLines}

INSTRUCCIONES:
1. Saluda con calidez y preséntate como el asistente de ${RESTAURANT_NAME}.
2. Pregunta qué desea ordenar el cliente. Usa la función add_item cada vez que el cliente mencione un platillo y cantidad; usa remove_item si el cliente cambia de opinión.
3. Si el cliente pide algo que no está en el menú, dile amablemente que no está disponible y sugiere una alternativa del menú.
4. Cuando el cliente termine de ordenar, pregunta si es para recoger en el restaurante o para entrega a domicilio, y usa set_order_type con el valor correspondiente.
5. Si es entrega a domicilio, pide la dirección completa y usa set_delivery_address.
6. Pregunta el nombre del cliente y usa set_customer_name.
7. Antes de cerrar, repite en voz alta el pedido completo (platillos, cantidades, notas, tipo de entrega, dirección si aplica) y pide confirmación explícita del cliente.
8. Solo cuando el cliente confirme que todo es correcto, invoca finalize_order.
9. Despídete con calidez después de finalizar el pedido.

Mantén un tono amigable, cálido y profesional durante toda la llamada. Habla en español.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config/restaurant.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config/restaurant.ts src/config/restaurant.test.ts
git commit -m "feat: add restaurant menu, system prompt, and menu matching"
```

---

## Task 5: Call session state

**Files:**
- Create: `src/voice/callSession.ts`
- Test: `src/voice/callSession.test.ts`

- [ ] **Step 1: Write the failing test**

`src/voice/callSession.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { createSession, getSession, deleteSession } from './callSession.js';

describe('callSession', () => {
  afterEach(() => {
    deleteSession('CA123');
  });

  it('creates a session with empty items and finalized=false', () => {
    const session = createSession('CA123');
    expect(session.callSid).toBe('CA123');
    expect(session.items).toEqual([]);
    expect(session.finalized).toBe(false);
  });

  it('retrieves a created session by callSid', () => {
    createSession('CA123');
    expect(getSession('CA123')?.callSid).toBe('CA123');
  });

  it('returns undefined for a session that does not exist', () => {
    expect(getSession('CA-nonexistent')).toBeUndefined();
  });

  it('removes a session on delete', () => {
    createSession('CA123');
    deleteSession('CA123');
    expect(getSession('CA123')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/voice/callSession.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement callSession.ts**

```ts
export type OrderType = 'pickup' | 'delivery';

export interface OrderItemDraft {
  name: string;
  quantity: number;
  notes?: string;
}

export interface CallSession {
  callSid: string;
  items: OrderItemDraft[];
  type?: OrderType;
  address?: string;
  customerName?: string;
  finalized: boolean;
}

const sessions = new Map<string, CallSession>();

export function createSession(callSid: string): CallSession {
  const session: CallSession = { callSid, items: [], finalized: false };
  sessions.set(callSid, session);
  return session;
}

export function getSession(callSid: string): CallSession | undefined {
  return sessions.get(callSid);
}

export function deleteSession(callSid: string): void {
  sessions.delete(callSid);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/voice/callSession.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/voice/callSession.ts src/voice/callSession.test.ts
git commit -m "feat: add in-memory call session state"
```

---

## Task 6: Realtime tool handlers (pure logic)

**Files:**
- Create: `src/voice/realtimeTools.ts`
- Test: `src/voice/realtimeTools.test.ts`

- [ ] **Step 1: Write the failing test**

`src/voice/realtimeTools.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createSession } from './callSession.js';
import type { CallSession } from './callSession.js';
import {
  addItem,
  removeItem,
  setOrderType,
  setDeliveryAddress,
  setCustomerName,
  validateFinalize,
} from './realtimeTools.js';

describe('realtimeTools', () => {
  let session: CallSession;

  beforeEach(() => {
    session = createSession('CA-test');
  });

  describe('addItem', () => {
    it('adds a valid menu item to the session', () => {
      const result = addItem(session, { name: 'Taco de asada', quantity: 2, notes: 'sin cebolla' });
      expect(result.ok).toBe(true);
      expect(session.items).toEqual([{ name: 'Taco de asada', quantity: 2, notes: 'sin cebolla' }]);
    });

    it('rejects an item not on the menu', () => {
      const result = addItem(session, { name: 'Pizza hawaiana', quantity: 1 });
      expect(result.ok).toBe(false);
      expect(session.items).toEqual([]);
    });
  });

  describe('removeItem', () => {
    it('removes an existing item', () => {
      addItem(session, { name: 'Taco de asada', quantity: 2 });
      const result = removeItem(session, { name: 'Taco de asada' });
      expect(result.ok).toBe(true);
      expect(session.items).toEqual([]);
    });

    it('reports failure when item is not in the order', () => {
      const result = removeItem(session, { name: 'Taco de asada' });
      expect(result.ok).toBe(false);
    });
  });

  describe('setOrderType', () => {
    it('clears address when switching from delivery to pickup', () => {
      session.address = 'Av. Reforma 123';
      setOrderType(session, { type: 'pickup' });
      expect(session.address).toBeUndefined();
    });
  });

  describe('setDeliveryAddress', () => {
    it('rejects setting address when type is not delivery', () => {
      const result = setDeliveryAddress(session, { address: 'Av. Reforma 123' });
      expect(result.ok).toBe(false);
      expect(session.address).toBeUndefined();
    });

    it('sets address when type is delivery', () => {
      setOrderType(session, { type: 'delivery' });
      const result = setDeliveryAddress(session, { address: 'Av. Reforma 123' });
      expect(result.ok).toBe(true);
      expect(session.address).toBe('Av. Reforma 123');
    });
  });

  describe('setCustomerName', () => {
    it('sets the customer name', () => {
      setCustomerName(session, { name: 'Juan' });
      expect(session.customerName).toBe('Juan');
    });
  });

  describe('validateFinalize', () => {
    it('fails when there are no items', () => {
      setOrderType(session, { type: 'pickup' });
      expect(validateFinalize(session).ok).toBe(false);
    });

    it('fails when order type is not set', () => {
      addItem(session, { name: 'Taco de asada', quantity: 1 });
      expect(validateFinalize(session).ok).toBe(false);
    });

    it('fails when delivery has no address', () => {
      addItem(session, { name: 'Taco de asada', quantity: 1 });
      setOrderType(session, { type: 'delivery' });
      expect(validateFinalize(session).ok).toBe(false);
    });

    it('passes for a valid pickup order', () => {
      addItem(session, { name: 'Taco de asada', quantity: 1 });
      setOrderType(session, { type: 'pickup' });
      expect(validateFinalize(session).ok).toBe(true);
    });

    it('passes for a valid delivery order with address', () => {
      addItem(session, { name: 'Taco de asada', quantity: 1 });
      setOrderType(session, { type: 'delivery' });
      setDeliveryAddress(session, { address: 'Av. Reforma 123' });
      expect(validateFinalize(session).ok).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/voice/realtimeTools.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement realtimeTools.ts**

```ts
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
  const menuItem = findMenuItem(args.name);
  if (!menuItem) {
    return { ok: false, reason: `"${args.name}" no está en el menú` };
  }
  session.items.push({ name: menuItem.name, quantity: args.quantity, notes: args.notes });
  return { ok: true, item: menuItem.name, quantity: args.quantity };
}

export function removeItem(session: CallSession, args: { name: string }): ToolResult {
  const index = session.items.findIndex(
    (item) => item.name.toLowerCase() === args.name.toLowerCase()
  );
  if (index === -1) {
    return { ok: false, reason: `"${args.name}" no estaba en el pedido` };
  }
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/voice/realtimeTools.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/voice/realtimeTools.ts src/voice/realtimeTools.test.ts
git commit -m "feat: add function-calling tool handlers and definitions"
```

---

## Task 7: Orders service (real-DB)

**Files:**
- Create: `src/orders/orders.service.ts`
- Test: `src/orders/orders.service.test.ts`

- [ ] **Step 1: Write the failing test**

`src/orders/orders.service.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/orders/orders.service.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement orders.service.ts**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS for all `orders.service.test.ts` cases (the `pretest` script pushes the schema to `prisma/test.db` first).

- [ ] **Step 5: Commit**

```bash
git add src/orders/orders.service.ts src/orders/orders.service.test.ts
git commit -m "feat: add orders service with real-DB tests"
```

---

## Task 8: Socket.io plugin

**Files:**
- Create: `src/realtime-events/socket.ts`

- [ ] **Step 1: Implement the plugin**

`src/realtime-events/socket.ts`:
```ts
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
```

`fastify-plugin` breaks Fastify's normal encapsulation so `fastify.io`/`emitOrderNew`/`emitOrderUpdated` are visible to routes registered later (`ordersRoutes`, `realtimeBridgeRoute`), not just inside this plugin's own scope.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to `src/realtime-events/socket.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/realtime-events/socket.ts
git commit -m "feat: add socket.io plugin with order broadcast helpers"
```

(No standalone test here — Task 9 exercises the decorators through `orders.routes.test.ts`.)

---

## Task 9: Orders REST routes

**Files:**
- Create: `src/orders/orders.routes.ts`
- Test: `src/orders/orders.routes.test.ts`

- [ ] **Step 1: Write the failing test**

`src/orders/orders.routes.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/orders/orders.routes.test.ts`
Expected: FAIL — `orders.routes.ts` does not exist.

- [ ] **Step 3: Implement orders.routes.ts**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/orders/orders.routes.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/orders/orders.routes.ts src/orders/orders.routes.test.ts
git commit -m "feat: add orders REST routes with socket.io broadcast"
```

---

## Task 10: Twilio call control helper

**Files:**
- Create: `src/voice/twilioCallControl.ts`
- Test: `src/voice/twilioCallControl.test.ts`

- [ ] **Step 1: Write the failing test**

`src/voice/twilioCallControl.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildHangupTwiml } from './twilioCallControl.js';

describe('buildHangupTwiml', () => {
  it('embeds the message inside a Say/Hangup TwiML response', () => {
    const twiml = buildHangupTwiml('Lo sentimos.');
    expect(twiml).toContain('<Say language="es-MX">Lo sentimos.</Say>');
    expect(twiml).toContain('<Hangup/>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/voice/twilioCallControl.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement twilioCallControl.ts**

This is used when the OpenAI Realtime connection fails mid-call: since the call is already inside `<Connect><Stream>`, the only way to make it speak an apology and hang up is via Twilio's REST API to redirect the live call to new TwiML.

```ts
export function buildHangupTwiml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-MX">${message}</Say><Hangup/></Response>`;
}

export async function hangupWithMessage(callSid: string, message: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ Twiml: buildHangupTwiml(message) }).toString(),
    }
  );

  if (!response.ok) {
    throw new Error(`Twilio call update failed: ${response.status} ${await response.text()}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/voice/twilioCallControl.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/voice/twilioCallControl.ts src/voice/twilioCallControl.test.ts
git commit -m "feat: add Twilio call control helper for graceful hangup"
```

---

## Task 11: Twilio voice webhook

**Files:**
- Create: `src/voice/twilioRoutes.ts`

- [ ] **Step 1: Implement the TwiML webhook**

`src/voice/twilioRoutes.ts`:
```ts
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to `src/voice/twilioRoutes.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/voice/twilioRoutes.ts
git commit -m "feat: add Twilio voice webhook returning TwiML Stream"
```

(Verified end-to-end with a real call in Task 16 — TwiML generation isn't worth mocking Twilio's request format for.)

---

## Task 12: Realtime audio bridge

**Files:**
- Create: `src/voice/realtimeBridge.ts`

- [ ] **Step 1: Implement the bridge**

`src/voice/realtimeBridge.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { createSession, getSession, deleteSession } from './callSession.js';
import type { CallSession } from './callSession.js';
import {
  addItem,
  removeItem,
  setOrderType,
  setDeliveryAddress,
  setCustomerName,
  validateFinalize,
  toolDefinitions,
  type ToolResult,
} from './realtimeTools.js';
import { buildSystemPrompt } from '../config/restaurant.js';
import { createOrderFromSession } from '../orders/orders.service.js';
import { hangupWithMessage } from './twilioCallControl.js';

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview';
const REALTIME_VOICE = 'alloy';
const APOLOGY_MESSAGE =
  'Lo sentimos, estamos teniendo problemas técnicos, por favor intenta más tarde.';

type ToolHandler = (session: CallSession, args: any) => ToolResult;

const toolHandlers: Record<string, ToolHandler> = {
  add_item: addItem,
  remove_item: removeItem,
  set_order_type: setOrderType,
  set_delivery_address: setDeliveryAddress,
  set_customer_name: setCustomerName,
};

export async function realtimeBridgeRoute(fastify: FastifyInstance) {
  fastify.get('/media-stream', { websocket: true }, (twilioSocket) => {
    let streamSid: string | null = null;
    let callSid: string | null = null;
    let openaiSocket: WebSocket | null = null;
    let sessionReady = false;
    let reconnectAttempted = false;

    function connectToOpenAI() {
      const socket = new WebSocket(OPENAI_REALTIME_URL, {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      socket.on('open', () => {
        fastify.log.info({ callSid }, 'connected to OpenAI Realtime API');
      });

      socket.on('message', (data) => handleOpenAIMessage(data.toString()));

      socket.on('error', (err) => {
        fastify.log.error({ callSid, err }, 'OpenAI Realtime WS error');
      });

      socket.on('close', () => {
        fastify.log.warn({ callSid, sessionReady }, 'OpenAI Realtime WS closed');
        if (sessionReady && !reconnectAttempted && callSid) {
          reconnectAttempted = true;
          sessionReady = false;
          fastify.log.info({ callSid }, 'attempting single reconnect to OpenAI');
          connectToOpenAI();
        } else if (!sessionReady && callSid) {
          void hangupWithMessage(callSid, APOLOGY_MESSAGE).catch((hangupErr) => {
            fastify.log.error({ callSid, hangupErr }, 'failed to hang up call after OpenAI failure');
          });
        }
      });

      openaiSocket = socket;
    }

    function sendSessionUpdate() {
      const session = callSid ? getSession(callSid) : undefined;
      const contextNote =
        session && session.items.length > 0
          ? ` El pedido hasta ahora incluye: ${session.items
              .map((i) => `${i.quantity} ${i.name}`)
              .join(', ')}.`
          : '';

      openaiSocket?.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['audio', 'text'],
            instructions: buildSystemPrompt() + contextNote,
            voice: REALTIME_VOICE,
            input_audio_format: 'g711_ulaw',
            output_audio_format: 'g711_ulaw',
            turn_detection: { type: 'server_vad' },
            tools: toolDefinitions,
            tool_choice: 'auto',
          },
        })
      );
      openaiSocket?.send(JSON.stringify({ type: 'response.create' }));
    }

    function handleOpenAIMessage(raw: string) {
      let event: any;
      try {
        event = JSON.parse(raw);
      } catch (err) {
        fastify.log.error({ callSid, err }, 'failed to parse OpenAI event');
        return;
      }

      switch (event.type) {
        case 'session.created':
          sessionReady = true;
          sendSessionUpdate();
          break;
        case 'response.audio.delta':
          if (streamSid) {
            twilioSocket.send(
              JSON.stringify({ event: 'media', streamSid, media: { payload: event.delta } })
            );
          }
          break;
        case 'response.function_call_arguments.done':
          void handleFunctionCall(event);
          break;
        case 'error':
          fastify.log.error({ callSid, event }, 'OpenAI Realtime error event');
          break;
        default:
          break;
      }
    }

    async function handleFunctionCall(event: { name: string; call_id: string; arguments: string }) {
      if (!callSid) return;
      const session = getSession(callSid);
      if (!session) return;

      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(event.arguments || '{}');
      } catch (err) {
        fastify.log.error({ callSid, err }, 'failed to parse function call arguments');
      }

      let result: ToolResult;

      if (event.name === 'finalize_order') {
        result = validateFinalize(session);
        if (result.ok) {
          const order = await createOrderFromSession(session);
          fastify.emitOrderNew(order);
          session.finalized = true;
        }
      } else {
        const handler = toolHandlers[event.name];
        result = handler ? handler(session, args) : { ok: false, reason: `función desconocida: ${event.name}` };
      }

      openaiSocket?.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: event.call_id,
            output: JSON.stringify(result),
          },
        })
      );
      openaiSocket?.send(JSON.stringify({ type: 'response.create' }));
    }

    function cleanup() {
      if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
        openaiSocket.close();
      }
      if (callSid) {
        deleteSession(callSid);
      }
    }

    twilioSocket.on('message', (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch (err) {
        fastify.log.error({ err }, 'failed to parse Twilio message');
        return;
      }

      switch (msg.event) {
        case 'start':
          streamSid = msg.start.streamSid;
          callSid = msg.start.callSid;
          createSession(callSid!);
          fastify.log.info({ callSid, streamSid }, 'call started');
          connectToOpenAI();
          break;
        case 'media':
          if (openaiSocket?.readyState === WebSocket.OPEN) {
            openaiSocket.send(
              JSON.stringify({ type: 'input_audio_buffer.append', audio: msg.media.payload })
            );
          }
          break;
        case 'stop':
          fastify.log.info({ callSid }, 'call stopped');
          cleanup();
          break;
        default:
          break;
      }
    });

    twilioSocket.on('close', () => {
      fastify.log.info({ callSid }, 'Twilio WS closed');
      cleanup();
    });

    twilioSocket.on('error', (err) => {
      fastify.log.error({ callSid, err }, 'Twilio WS error');
    });
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to `src/voice/realtimeBridge.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/voice/realtimeBridge.ts
git commit -m "feat: add Twilio<->OpenAI Realtime audio bridge"
```

(No automated test — this module only makes sense wired to real Twilio Media Streams and the real OpenAI Realtime API. It's verified end-to-end with a live call in Task 16, per the spec's testing section.)

---

## Task 13: Server bootstrap

**Files:**
- Create: `src/server.ts`

- [ ] **Step 1: Implement server.ts**

```ts
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { socketPlugin } from './realtime-events/socket.js';
import { ordersRoutes } from './orders/orders.routes.js';
import { twilioRoutes } from './voice/twilioRoutes.js';
import { realtimeBridgeRoute } from './voice/realtimeBridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({ logger: true });

await fastify.register(fastifyWebsocket);
await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/',
});
await fastify.register(socketPlugin);
await fastify.register(ordersRoutes);
await fastify.register(twilioRoutes);
await fastify.register(realtimeBridgeRoute);

fastify.setErrorHandler((error, _request, reply) => {
  fastify.log.error(error);
  reply.status(500).send({ error: 'internal server error' });
});

const port = Number(process.env.PORT ?? 3000);

fastify.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
```

- [ ] **Step 2: Verify the server boots**

Run: `npm run dev`
Expected: log line showing the server listening on the configured port, no crash. Stop it with Ctrl+C once confirmed.

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

Run: `npm test`
Expected: all tests from Tasks 4-10 still PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat: wire up Fastify server with all plugins and routes"
```

---

## Task 14: Dashboard UI

**Files:**
- Create: `public/dashboard/index.html`
- Create: `public/dashboard/dashboard.css`
- Create: `public/dashboard/dashboard.js`

- [ ] **Step 1: Create index.html**

`public/dashboard/index.html`:
```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tacos El Compa — Pedidos</title>
  <link rel="stylesheet" href="dashboard.css" />
</head>
<body>
  <header class="topbar">
    <h1>Tacos El Compa</h1>
  </header>
  <main class="board">
    <section class="column" data-status="recibido">
      <h2>Recibido</h2>
      <div class="cards" id="cards-recibido"></div>
    </section>
    <section class="column" data-status="preparando">
      <h2>Preparando</h2>
      <div class="cards" id="cards-preparando"></div>
    </section>
    <section class="column" data-status="listo">
      <h2>Listo</h2>
      <div class="cards" id="cards-listo"></div>
    </section>
    <section class="column" data-status="completado">
      <h2>Completado</h2>
      <div class="cards" id="cards-completado"></div>
    </section>
  </main>
  <script src="/socket.io/socket.io.js"></script>
  <script src="dashboard.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create dashboard.css**

`public/dashboard/dashboard.css`:
```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #f4f4f4; }
.topbar { background: #1a1a1a; color: white; padding: 16px 24px; }
.topbar h1 { margin: 0; font-size: 1.4rem; }
.board { display: grid; grid-template-columns: repeat(4, minmax(280px, 1fr)); gap: 12px; padding: 16px; overflow-x: auto; }
.column { background: #e9e9e9; border-radius: 12px; padding: 12px; min-width: 280px; }
.column h2 { margin: 0 0 12px; font-size: 1.1rem; text-align: center; }
.cards { display: flex; flex-direction: column; gap: 12px; }
.card { background: white; border-radius: 10px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
.card-header { display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 6px; }
.time { font-weight: 400; color: #666; font-size: 0.85rem; }
.badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; margin-bottom: 6px; }
.badge-pickup { background: #d7f0d7; color: #1a5c1a; }
.badge-delivery { background: #d7e6f0; color: #1a3d5c; }
.address { margin: 4px 0; font-size: 0.9rem; color: #444; }
.items { margin: 8px 0; padding-left: 18px; }
.advance-btn { width: 100%; padding: 14px; font-size: 1rem; border: none; border-radius: 8px; background: #1a1a1a; color: white; cursor: pointer; min-height: 44px; }
.advance-btn:active { background: #333; }
@media (max-width: 900px) {
  .board { grid-auto-flow: column; grid-template-columns: none; grid-auto-columns: 85%; }
}
```

- [ ] **Step 3: Create dashboard.js**

`public/dashboard/dashboard.js`:
```js
const NEXT_STATUS = {
  recibido: 'preparando',
  preparando: 'listo',
  listo: 'completado',
};

const socket = io();

function timeAgo(isoDate) {
  const minutes = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (minutes < 1) return 'hace un momento';
  if (minutes === 1) return 'hace 1 min';
  return `hace ${minutes} min`;
}

function renderCard(order) {
  const card = document.createElement('article');
  card.className = 'card';
  card.id = `order-${order.id}`;

  const itemsHtml = order.items
    .map((item) => `<li>${item.quantity}× ${item.name}${item.notes ? ` — <em>${item.notes}</em>` : ''}</li>`)
    .join('');

  const typeLabel = order.type === 'delivery' ? 'Entrega a domicilio' : 'Para recoger';
  const addressHtml =
    order.type === 'delivery' && order.address ? `<p class="address">${order.address}</p>` : '';
  const nextStatus = NEXT_STATUS[order.status];

  card.innerHTML = `
    <div class="card-header">
      <span class="customer">${order.customerName || 'Cliente'}</span>
      <span class="time">${timeAgo(order.createdAt)}</span>
    </div>
    <span class="badge badge-${order.type}">${typeLabel}</span>
    ${addressHtml}
    <ul class="items">${itemsHtml}</ul>
    ${nextStatus ? `<button class="advance-btn" data-id="${order.id}" data-next="${nextStatus}">Avanzar a ${nextStatus}</button>` : ''}
  `;

  card.querySelector('.advance-btn')?.addEventListener('click', async (e) => {
    const id = e.currentTarget.getAttribute('data-id');
    const next = e.currentTarget.getAttribute('data-next');
    await fetch(`/api/orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
  });

  return card;
}

function placeCard(order) {
  document.getElementById(`order-${order.id}`)?.remove();
  document.getElementById(`cards-${order.status}`)?.prepend(renderCard(order));
}

async function loadInitialOrders() {
  const response = await fetch('/api/orders');
  const orders = await response.json();
  orders.forEach(placeCard);
}

socket.on('order:new', placeCard);
socket.on('order:updated', placeCard);

loadInitialOrders();
```

- [ ] **Step 4: Manually verify in a browser**

Run: `npm run dev`, open `http://localhost:3000/dashboard/index.html`.
Expected: page loads with 4 empty columns, no console errors, socket.io connects (check Network tab for a `101` on `/socket.io/`).

- [ ] **Step 5: Commit**

```bash
git add public/
git commit -m "feat: add kanban dashboard UI"
```

---

## Task 15: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README.md**

```markdown
# Contestame.ai — MVP

IA de voz que contesta llamadas telefónicas y toma pedidos para "Tacos El Compa" (restaurante de prueba, hardcodeado). El pedido aparece en tiempo real en un dashboard kanban.

## Instalación

\`\`\`bash
npm install
cp .env.example .env
# llena OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN en .env
npx prisma migrate dev
\`\`\`

## Correr en desarrollo

\`\`\`bash
npm run dev
\`\`\`

El servidor levanta en `http://localhost:3000` (o el `PORT` que definas). El dashboard vive en `http://localhost:3000/dashboard/index.html`.

## Correr los tests

\`\`\`bash
npm test
\`\`\`

Esto empuja el esquema a una base de datos SQLite separada (`prisma/test.db`) antes de correr Vitest.

## Exponer el servidor local con ngrok y configurar Twilio

1. Instala [ngrok](https://ngrok.com/download) si no lo tienes.
2. Con el servidor corriendo (`npm run dev`), en otra terminal:
   \`\`\`bash
   ngrok http 3000
   \`\`\`
3. Copia la URL HTTPS que te da ngrok (ej. `https://abcd1234.ngrok-free.app`).
4. En la [consola de Twilio](https://console.twilio.com), ve a **Phone Numbers → Manage → Active Numbers** y selecciona tu número.
5. En la sección **Voice Configuration**, bajo "A call comes in", selecciona **Webhook**, pega `https://<tu-url-de-ngrok>/voice` y método **HTTP POST**.
6. Guarda los cambios.

## Probar llamando al número de Twilio

1. Con el servidor corriendo y ngrok activo, llama al número de Twilio desde tu celular.
2. Sigue un guion de prueba, por ejemplo:
   - "Hola, quiero 2 tacos de asada y una quesadilla de queso"
   - Cuando pregunte: "Para recoger"
   - Cuando pregunte tu nombre: dilo
   - Cuando repita el pedido completo, confirma que está correcto
3. Abre `http://localhost:3000/dashboard/index.html` (o la URL de ngrok) y verifica que el pedido aparece en la columna "Recibido" apenas cuelgas.
4. Prueba el botón "Avanzar a preparando" y confirma que la tarjeta se mueve de columna en tiempo real.

## Estructura del proyecto

Ver `docs/superpowers/specs/2026-08-13-contestame-mvp-design.md` para el diseño completo (arquitectura, esquema de datos, manejo de errores).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup, ngrok, and Twilio testing instructions"
```

---

## Task 16: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite one last time**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Follow the README's ngrok + Twilio setup**

Start the dev server, start ngrok, point the Twilio number's Voice webhook at `https://<ngrok-url>/voice`.

- [ ] **Step 4: Place a real test call and follow the test script**

Call the Twilio number. Order at least 2 different dishes, choose delivery (to also exercise `set_delivery_address`), give a name, and confirm the order when the AI reads it back.

- [ ] **Step 5: Verify the order lands on the dashboard**

Open `http://localhost:3000/dashboard/index.html` and confirm the new order card appears in "Recibido" with the correct items, quantities, notes (if any), delivery badge, address, and customer name — without a page refresh.

- [ ] **Step 6: Verify status transitions**

Click "Avanzar a preparando", then "Avanzar a listo", then "Avanzar a completado". Confirm each click moves the card to the next column live.

- [ ] **Step 7: Verify error handling for an out-of-menu item**

During a second test call, ask for a dish not on the menu (e.g., "quiero una hamburguesa"). Confirm the AI says it's not available and offers an alternative, instead of silently adding a fake item.

- [ ] **Step 8: Commit any fixes found during manual testing**

If Steps 4-7 reveal bugs, fix them in the relevant task's files and commit with a `fix:` message describing what was wrong.
