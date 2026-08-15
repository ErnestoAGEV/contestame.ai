import type { FastifyInstance } from 'fastify';
import WebSocket, { WebSocketServer } from 'ws';
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

const OPENAI_REALTIME_MODEL = 'gpt-realtime-2.1';
const OPENAI_REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${OPENAI_REALTIME_MODEL}`;
const REALTIME_VOICE = 'marin';
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
  // Plain `ws` server in noServer mode, dispatched manually below — NOT
  // @fastify/websocket, which attaches a blanket 'upgrade' listener that intercepts
  // every WebSocket upgrade on the shared HTTP server (including socket.io's own
  // /socket.io/ handshake), crashing the process with "handleUpgrade() was called
  // more than once with the same socket" as soon as a dashboard client connects.
  // Handling /media-stream's upgrade ourselves, scoped to its exact path, lets
  // socket.io's upgrade listener (registered by socketPlugin) handle its own path
  // without interference.
  const wss = new WebSocketServer({ noServer: true });

  fastify.server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/media-stream') return;
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (twilioSocket) => {
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
    // True between a response.created and its matching response.done. Guards manual
    // response.create calls (greeting, post-tool-call) so we never ask OpenAI to start
    // a second response while one is still in flight (conversation_already_has_active_response).
    let responseActive = false;
    // True once we've actually forwarded at least one audio chunk of the current response
    // to Twilio. Barge-in (speech_started) should only cancel/clear when the caller is
    // interrupting audio they can actually hear — otherwise a VAD false-positive right as
    // a response starts (e.g. call-setup noise) cancels a response before it ever plays,
    // leaving the conversation stuck with nothing audible having been said.
    let responseAudioStarted = false;

    function requestResponse() {
      if (responseActive) return;
      openaiSocket?.send(JSON.stringify({ type: 'response.create' }));
    }

    function connectToOpenAI() {
      const socket = new WebSocket(OPENAI_REALTIME_URL, {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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
            type: 'realtime',
            model: OPENAI_REALTIME_MODEL,
            instructions: buildSystemPrompt() + contextNote,
            output_modalities: ['audio'],
            audio: {
              input: {
                format: { type: 'audio/pcmu' },
                turn_detection: {
                  type: 'server_vad',
                  // Let OpenAI truncate/cancel the in-flight response itself the
                  // instant it detects speech, instead of us round-tripping a manual
                  // response.cancel — that round trip is exactly what made
                  // interruptions feel slow to react.
                  interrupt_response: true,
                  create_response: true,
                  // Lower than the 0.5 default: react to a quieter/faster voice onset
                  // when the caller starts talking over the agent, at the cost of being
                  // slightly more sensitive to background noise.
                  threshold: 0.35,
                },
              },
              output: {
                format: { type: 'audio/pcmu' },
                voice: REALTIME_VOICE,
              },
            },
            tools: toolDefinitions,
            tool_choice: 'auto',
          },
        })
      );
      if (!isReconnect) {
        requestResponse();
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
        case 'response.created':
          responseActive = true;
          responseAudioStarted = false;
          break;
        case 'response.output_audio.delta':
          responseAudioStarted = true;
          if (streamSid) {
            twilioSocket.send(
              JSON.stringify({ event: 'media', streamSid, media: { payload: event.delta } })
            );
          }
          break;
        case 'input_audio_buffer.speech_started':
          // Caller started talking over the agent. `turn_detection.interrupt_response`
          // (set in sendSessionUpdate) tells OpenAI to cancel/truncate the response
          // itself the instant it detects speech — faster than us round-tripping a
          // manual response.cancel and waiting for confirmation. All we still need to
          // do client-side is flush whatever audio Twilio already has buffered, so
          // playback actually stops instead of continuing from the buffer. Gated on
          // responseAudioStarted so a VAD false-positive before anything has played
          // (e.g. call-setup noise) doesn't clear a response that hasn't started yet.
          if (responseAudioStarted && streamSid) {
            fastify.log.info({ callSid }, 'barge-in: clearing Twilio audio buffer');
            twilioSocket.send(JSON.stringify({ event: 'clear', streamSid }));
          }
          break;
        case 'response.done': {
          responseActive = false;
          responseAudioStarted = false;
          const outputs = event.response?.output ?? [];
          for (const item of outputs) {
            if (item.type !== 'function_call') continue;
            void handleFunctionCall(item).catch((err) => {
              fastify.log.error({ callSid, err }, 'unhandled error in handleFunctionCall');
            });
          }
          break;
        }
        case 'error':
          // Benign race: server_vad auto-creates a response as soon as it detects the
          // caller stopped talking, which can land just before our own manual
          // response.create (e.g. right after sending a function_call_output). OpenAI
          // rejects the redundant request; the response already in flight continues
          // normally, so there's nothing to recover here.
          if (event.error?.code === 'conversation_already_has_active_response') {
            fastify.log.info({ callSid }, 'response.create raced with server-driven response (harmless)');
            break;
          }
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
      requestResponse();
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
