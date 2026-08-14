# Contestame.ai — MVP

IA de voz que contesta llamadas telefónicas y toma pedidos para "Tacos El Compa" (restaurante de prueba, hardcodeado). El pedido aparece en tiempo real en un dashboard kanban.

## Instalación

```bash
npm install
cp .env.example .env
# llena OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN en .env
npx prisma migrate dev
```

> El servidor levanta sin problema aunque dejes estas credenciales vacías, pero una llamada real fallará (el que llama escucha una disculpa y se corta) si `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID` o `TWILIO_AUTH_TOKEN` no están bien configuradas — si tienes un colgado silencioso durante pruebas, revisa esto primero.

## Correr en desarrollo

```bash
npm run dev
```

El servidor levanta en `http://localhost:3000` (o el `PORT` que definas en `.env`). El dashboard vive en `http://localhost:3000/dashboard/index.html`.

## Correr los tests

```bash
npm test
```

Esto empuja el esquema a una base de datos SQLite separada (`prisma/test.db`) antes de correr Vitest.

## Exponer el servidor local con ngrok y configurar Twilio

Esta sección solo es necesaria para probar llamadas telefónicas reales; el dashboard y `/api/orders` funcionan sin ngrok ni Twilio en cuanto el servidor está corriendo.

1. Instala [ngrok](https://ngrok.com/download) si no lo tienes.
2. Con el servidor corriendo (`npm run dev`), en otra terminal:
   ```bash
   ngrok http 3000
   ```
3. Copia la URL HTTPS que te da ngrok (ej. `https://abcd1234.ngrok-free.app`).
4. En la [consola de Twilio](https://console.twilio.com), ve a **Phone Numbers → Manage → Active Numbers** y selecciona tu número.
5. En la sección **Voice Configuration**, bajo "A call comes in", selecciona **Webhook**, pega `https://<tu-url-de-ngrok>/voice` y método **HTTP POST**.
6. Guarda los cambios.
7. Opcional: por defecto el servidor detecta el host a usar en la respuesta TwiML a partir del header `Host` de la petición entrante, así que el paso anterior es suficiente. Si prefieres fijar el host manualmente en vez de detectarlo automáticamente, agrega `PUBLIC_HOST=<tu-url-de-ngrok-sin-https>` a tu `.env` y reinicia el servidor.

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
