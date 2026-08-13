# Contestame.ai — MVP: IA de voz que toma pedidos telefónicos (Tacos El Compa)

**Fecha:** 2026-08-13
**Alcance:** Un solo restaurante hardcodeado ("Tacos El Compa"), sin autenticación ni multi-tenancy. Objetivo: validar el flujo completo voz → pedido → dashboard.

## Contexto de negocio

Un cliente llama al restaurante. Una IA de voz contesta, toma su pedido (platillos del menú, cantidades, notas especiales), pregunta si es para recoger o entrega a domicilio (y si es entrega, pide la dirección), confirma el pedido completo en voz alta, y cuelga. El pedido aparece inmediatamente en un dashboard web (iPad/celular) donde el restaurante puede cambiar su estatus.

## Stack

Fastify 5 + `@fastify/websocket` + `@fastify/static` + `ws` (cliente saliente a OpenAI) + socket.io + Prisma + SQLite + TypeScript (`tsx` en dev, `tsc` para build) + `dotenv`. Dashboard: HTML + vanilla JS servido estático, sin build step.

## Estructura de carpetas

```
contestame.ai/
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
├── prisma/
│   └── schema.prisma
├── src/
│   ├── server.ts
│   ├── config/
│   │   └── restaurant.ts
│   ├── voice/
│   │   ├── twilioRoutes.ts
│   │   ├── realtimeBridge.ts
│   │   ├── realtimeTools.ts
│   │   └── callSession.ts
│   ├── orders/
│   │   ├── orders.routes.ts
│   │   └── orders.service.ts
│   ├── realtime-events/
│   │   └── socket.ts
│   └── lib/
│       ├── prisma.ts
│       └── logger.ts
└── public/
    └── dashboard/
        ├── index.html
        ├── dashboard.js
        └── dashboard.css
```

## Arquitectura del puente de audio

`@fastify/websocket` maneja la ruta `/media-stream` (WS entrante de Twilio) dentro del ciclo de vida normal de Fastify (logging, decoradores). Dentro de ese handler se abre una conexión saliente con `ws` hacia la OpenAI Realtime API. Todo corre en un solo proceso Fastify, junto con la API REST, socket.io y el dashboard estático.

Estado de cada llamada en curso vive **en memoria** (`callSession.ts`, `Map<callSid, CallSession>`): items del pedido, tipo, dirección, nombre. Solo se persiste a SQLite cuando la IA invoca `finalize_order()`. Si la llamada se corta antes, el pedido no se guarda — no hay pedidos a medias en el dashboard.

## Flujo de datos

```
Llamada entrante
   │
   ▼
Twilio marca el número → POST /voice
   │  responde TwiML: <Connect><Stream url="wss://.../media-stream"/></Connect>
   ▼
Twilio abre WS a /media-stream (evento "start" trae callSid)
   │
   ▼
realtimeBridge.ts:
   1. crea CallSession en memoria keyed por callSid
   2. abre WS saliente a OpenAI Realtime API
   3. session.update: system prompt (menú + instrucciones), voice, formato
      audio g711_ulaw/8kHz in/out, y las 6 tools declaradas
   │
   ├── Twilio → Bridge: evento "media" (base64 μ-law 8kHz)
   │        → reenviado como input_audio_buffer.append a OpenAI
   │
   ├── OpenAI → Bridge: evento response.audio.delta (base64 μ-law)
   │        → reenviado como evento "media" al WS de Twilio
   │
   └── OpenAI → Bridge: evento response.function_call_arguments.done
            → realtimeTools.ts ejecuta el handler correspondiente
            → handler muta la CallSession en memoria
            → Bridge responde con function_call_output

Cliente confirma pedido → IA invoca finalize_order()
   │
   ▼
finalize_order handler:
   1. valida items.length > 0, type fijado, address si delivery
   2. orders.service.createOrder(session) → Prisma INSERT Order + OrderItems, status "recibido"
   3. socket.ts emite "order:new" a todos los dashboards conectados
   4. CallSession se marca finalizada
   5. function_call_output confirma a la IA para que despida y cuelgue

Twilio evento "stop" o WS cerrado → cleanup: cierra WS de OpenAI, borra CallSession del Map

Dashboard:
GET /api/orders al cargar → pinta columnas por status
socket.io: "order:new" agrega tarjeta, "order:updated" mueve tarjeta de columna
Click "Avanzar estatus" → PATCH /api/orders/:id/status → emite "order:updated"
```

## Esquema Prisma (SQLite)

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
  id       Int    @id @default(autoincrement())
  orderId  Int
  order    Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  name     String
  quantity Int
  notes    String?
}
```

Decisión: "entregado" y "recogido" colapsan en un solo estado `completado`. La tarjeta ya distingue pickup/delivery visualmente, así que un quinto estado sería redundante en el kanban.

## API REST

**`GET /api/orders`** — lista todos los pedidos con items, más recientes primero.

**`PATCH /api/orders/:id/status`** — body `{ "status": "preparando" }`, valida contra el enum, actualiza, emite `order:updated`. 404 si no existe, 400 si status inválido.

## Eventos socket.io

| Evento | Payload | Cuándo |
|---|---|---|
| `order:new` | Order completo con items | al ejecutarse `finalize_order()` |
| `order:updated` | Order completo con items | al hacer PATCH de status |

Un solo canal broadcast, sin namespaces ni rooms (alcance de un solo restaurante).

## Las 6 tools de function-calling

```
add_item({ name, quantity, notes? })
  → busca `name` en el menú (match flexible); si no existe, function_call_output
    de error para que la IA le pregunte de nuevo en vez de inventar un platillo.
  → agrega { name, quantity, notes } al arreglo items de la CallSession.

remove_item({ name })
  → quita la primera coincidencia por nombre.
  → si no la encuentra, function_call_output indica que no estaba en el pedido.

set_order_type({ type: "pickup" | "delivery" })
  → fija session.type. Si cambia de delivery a pickup, limpia session.address.

set_delivery_address({ address })
  → solo tiene efecto si session.type === "delivery"; si no, function_call_output
    le recuerda a la IA que primero debe fijar el tipo.

set_customer_name({ name })
  → fija session.customerName.

finalize_order()
  → valida items.length > 0, type fijado, y address si type === "delivery".
  → si falla, function_call_output describe qué falta.
  → si pasa: persiste en DB, emite order:new, marca session.finalized = true.
```

Todas las tools devuelven `function_call_output` con `{ ok: true, ... }` o `{ ok: false, reason: "..." }` — la IA siempre tiene contexto para decidir la siguiente frase, sin asumir éxito silencioso.

## Manejo de errores y reconexión

**WS Twilio ↔ Bridge:** si se cierra inesperadamente, el bridge cierra el WS de OpenAI y borra la CallSession — no se reconecta hacia Twilio (la llamada ya terminó). Logs estructurados (pino) con `callSid` en cada línea.

**WS Bridge ↔ OpenAI:**
- Si falla al abrir (antes de `session.created`): TwiML de error corto (`<Say>...problemas técnicos...</Say><Hangup/>`), sin reintentos.
- Si se cae a media llamada (después de `session.created`): **una sola reconexión automática**, re-inyectando el estado ya recolectado como contexto ("el pedido hasta ahora es: X, Y") vía mensaje de sistema. Si también falla, cuelga con TwiML de error.
- Sin reintentos infinitos ni backoff — es una llamada en vivo con un humano esperando.

**Errores en tools:** nunca tiran la conexión, siempre `function_call_output` con `ok: false`.

**Errores REST:** JSON `{ error: string }` con status code apropiado, capturados por `setErrorHandler` global de Fastify.

## Dashboard (vanilla JS)

4 columnas (Recibido/Preparando/Listo/Completado), CSS grid que colapsa a scroll horizontal en pantallas angostas, botones táctiles ≥44px. Cada tarjeta: cliente, hora relativa, badge pickup/delivery (+ dirección), items con cantidad/notas, botón "Avanzar a [siguiente estatus]". `dashboard.js` pinta estado inicial con `fetch('/api/orders')`, luego todo push vía socket.io (sin polling), re-renderizando solo la tarjeta afectada.

## Testing (alcance MVP)

Sin suite automatizada de integración — el objetivo es validar el flujo de voz real. Sí: un test unitario ligero (Vitest) para lógica pura sin I/O — validación de `finalize_order` (falta type, falta address en delivery, carrito vacío) y matching de `add_item` contra el menú. Verificación del flujo completo: script manual documentado en el README (llamar al número de Twilio, seguir un guion de prueba, verificar que aparece en el dashboard).

## README

Instalación (`npm install`, `npx prisma migrate dev`), variables de entorno, correr en dev (`npm run dev`), exponer con `ngrok http $PORT`, configurar el Voice Webhook del número de Twilio con la URL de ngrok + `/voice`, y guion de prueba de llamada.

## Variables de entorno

```
OPENAI_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
PORT=3000
DATABASE_URL="file:./dev.db"
```
