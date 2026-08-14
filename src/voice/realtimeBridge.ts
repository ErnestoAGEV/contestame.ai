import type { FastifyInstance } from 'fastify';
import '@fastify/websocket';
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
    // Intentional policy: only ONE reconnect attempt is ever made per call, and this
    // flag is never reset back to false — a second drop in the same call ends it.
    let reconnectAttempted = false;
    // Set at the start of cleanup() so async socket event handlers (close/error) fired
    // as a side effect of an intentional shutdown know to no-op instead of reconnecting
    // or hanging up a call that is already ending.
    let shuttingDown = false;

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
        if (shuttingDown) return;
        fastify.log.warn({ callSid, sessionReady }, 'OpenAI Realtime WS closed');
        if (sessionReady && !reconnectAttempted && callSid) {
          reconnectAttempted = true;
          sessionReady = false;
          fastify.log.info({ callSid }, 'attempting single reconnect to OpenAI');
          connectToOpenAI();
        } else if (!sessionReady && callSid) {
          void hangupWithMessage(callSid, APOLOGY_MESSAGE).catch((hangupErr) => {
            fastify.log.error({ callSid, hangupErr }, 'failed to hang up call after OpenAI failure');
            cleanup();
          });
        }
      });

      openaiSocket = socket;
    }

    function sendSessionUpdate(isReconnect: boolean) {
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
      if (!isReconnect) {
        openaiSocket?.send(JSON.stringify({ type: 'response.create' }));
      }
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
          sendSessionUpdate(reconnectAttempted);
          break;
        case 'response.audio.delta':
          if (streamSid) {
            twilioSocket.send(
              JSON.stringify({ event: 'media', streamSid, media: { payload: event.delta } })
            );
          }
          break;
        case 'response.function_call_arguments.done':
          void handleFunctionCall(event).catch((err) => {
            fastify.log.error({ callSid, err }, 'unhandled error in handleFunctionCall');
          });
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

      let result: ToolResult;

      try {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(event.arguments || '{}');
        } catch (err) {
          fastify.log.error({ callSid, err }, 'failed to parse function call arguments');
        }

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
      } catch (err) {
        fastify.log.error({ callSid, err }, 'error handling function call');
        result = { ok: false, reason: 'ocurrió un error interno, por favor intenta de nuevo' };
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
      shuttingDown = true;
      if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
        openaiSocket.close();
      }
      if (callSid) {
        deleteSession(callSid);
        callSid = null;
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
      cleanup();
    });
  });
}
