import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getOrCreateSession, getSession, deleteSession } from './callSession.js';
import type { OrderType } from './callSession.js';
import {
  addItem,
  removeItem,
  setOrderType,
  setDeliveryAddress,
  setCustomerName,
  validateFinalize,
  type ToolResult,
} from './realtimeTools.js';
import { createOrderFromSession } from '../orders/orders.service.js';

/**
 * HTTP webhook endpoints called by the ElevenLabs Conversational AI agent's
 * server tools during a live call. ElevenLabs runs the whole conversation
 * (speech, LLM, voice, turn-taking) and hits these when the agent needs to
 * mutate/persist the order. The order-taking logic itself is the same pure
 * functions the old OpenAI bridge used — only the transport changed.
 *
 * Session correlation: ElevenLabs is configured to send its `conversation_id`
 * (its `system__conversation_id` dynamic variable) in each tool body, which we
 * use as the in-memory session key — replacing Twilio's callSid, which we no
 * longer see now that ElevenLabs owns the telephony.
 */
export async function toolWebhookRoutes(fastify: FastifyInstance) {
  // Optional shared-secret guard. Configure the same value as an `x-tools-secret`
  // header on each tool in the ElevenLabs dashboard and set TOOLS_WEBHOOK_SECRET
  // here; if unset (local dev), the check is skipped.
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/tools/')) return;
    const secret = process.env.TOOLS_WEBHOOK_SECRET;
    if (secret && request.headers['x-tools-secret'] !== secret) {
      return reply.code(401).send({ ok: false, reason: 'no autorizado' });
    }
  });

  // Resolves the session for a tool request, or replies 400 and returns null when
  // the caller didn't send a conversation_id (a misconfigured tool, not a normal
  // conversational failure — those return { ok: false, reason } with 200 instead).
  function resolveSession(
    request: FastifyRequest<{ Body: { conversation_id?: string } }>,
    reply: FastifyReply
  ) {
    const conversationId = request.body?.conversation_id;
    if (!conversationId) {
      reply.code(400).send({ ok: false, reason: 'falta conversation_id' });
      return null;
    }
    return getOrCreateSession(conversationId);
  }

  fastify.post<{ Body: { conversation_id?: string; name: string; quantity: number; notes?: string } }>(
    '/tools/add-item',
    async (request, reply) => {
      const session = resolveSession(request, reply);
      if (!session) return;
      const { name, quantity, notes } = request.body;
      const result = addItem(session, { name, quantity, notes });
      fastify.log.info({ conversationId: session.callSid, name, quantity, ok: result.ok }, 'tool: add_item');
      return result;
    }
  );

  fastify.post<{ Body: { conversation_id?: string; name: string } }>(
    '/tools/remove-item',
    async (request, reply) => {
      const session = resolveSession(request, reply);
      if (!session) return;
      return removeItem(session, { name: request.body.name });
    }
  );

  fastify.post<{ Body: { conversation_id?: string; type: OrderType } }>(
    '/tools/set-order-type',
    async (request, reply) => {
      const session = resolveSession(request, reply);
      if (!session) return;
      return setOrderType(session, { type: request.body.type });
    }
  );

  fastify.post<{ Body: { conversation_id?: string; address: string } }>(
    '/tools/set-delivery-address',
    async (request, reply) => {
      const session = resolveSession(request, reply);
      if (!session) return;
      return setDeliveryAddress(session, { address: request.body.address });
    }
  );

  fastify.post<{ Body: { conversation_id?: string; name: string } }>(
    '/tools/set-customer-name',
    async (request, reply) => {
      const session = resolveSession(request, reply);
      if (!session) return;
      return setCustomerName(session, { name: request.body.name });
    }
  );

  fastify.post<{ Body: { conversation_id?: string } }>(
    '/tools/finalize-order',
    async (request, reply) => {
      const session = resolveSession(request, reply);
      if (!session) return;

      const validation = validateFinalize(session);
      if (!validation.ok) return validation;

      try {
        const order = await createOrderFromSession(session);
        fastify.emitOrderNew(order);
        session.finalized = true;
        deleteSession(session.callSid);
        fastify.log.info({ conversationId: session.callSid, orderId: order.id }, 'tool: finalize_order persisted');
        return { ok: true, orderId: order.id } satisfies ToolResult;
      } catch (err) {
        fastify.log.error({ conversationId: session.callSid, err }, 'finalize_order failed to persist');
        return { ok: false, reason: 'ocurrió un error interno al guardar el pedido' } satisfies ToolResult;
      }
    }
  );

  // Optional: ElevenLabs post-call webhook can hit this to release the in-memory
  // session for a call that ended without finalizing, so abandoned orders don't
  // linger. Safe to call with an unknown/finalized id (no-op).
  fastify.post<{ Body: { conversation_id?: string } }>('/tools/end-call', async (request, reply) => {
    const conversationId = request.body?.conversation_id;
    if (!conversationId) {
      return reply.code(400).send({ ok: false, reason: 'falta conversation_id' });
    }
    if (getSession(conversationId)) deleteSession(conversationId);
    return { ok: true };
  });
}
