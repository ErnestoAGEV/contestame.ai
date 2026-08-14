import { describe, it, expect, afterEach } from 'vitest';
import Fastify from 'fastify';
import { twilioRoutes } from './twilioRoutes.js';

async function buildTestServer() {
  const app = Fastify();
  await app.register(twilioRoutes);
  return app;
}

describe('POST /voice', () => {
  const ORIGINAL_PUBLIC_HOST = process.env.PUBLIC_HOST;

  afterEach(() => {
    if (ORIGINAL_PUBLIC_HOST === undefined) {
      delete process.env.PUBLIC_HOST;
    } else {
      process.env.PUBLIC_HOST = ORIGINAL_PUBLIC_HOST;
    }
  });

  it('uses the request Host header when PUBLIC_HOST is not set', async () => {
    delete process.env.PUBLIC_HOST;
    const app = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: '/voice',
      headers: { host: 'example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/xml');
    expect(response.body).toContain('wss://example.com/media-stream');

    await app.close();
  });

  it('prefers PUBLIC_HOST over the request Host header', async () => {
    process.env.PUBLIC_HOST = 'myapp.ngrok.io';
    const app = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: '/voice',
      headers: { host: 'example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('wss://myapp.ngrok.io/media-stream');
    expect(response.body).not.toContain('wss://example.com/media-stream');

    await app.close();
  });

  it('escapes XML-special characters in the Host header', async () => {
    delete process.env.PUBLIC_HOST;
    const app = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: '/voice',
      headers: { host: 'evil.com"><script>x</script>' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('<script>');
    expect(response.body).toContain(
      'wss://evil.com&quot;&gt;&lt;script&gt;x&lt;/script&gt;/media-stream'
    );

    await app.close();
  });

  it('returns 400 when no host is available', async () => {
    delete process.env.PUBLIC_HOST;
    const app = Fastify();
    // Simulate a request with no usable Host header (e.g. stripped by a
    // proxy) — light-my-request always injects a default Host, so remove it
    // ourselves before the route handler runs.
    app.addHook('onRequest', async (request) => {
      delete request.headers.host;
    });
    await app.register(twilioRoutes);

    const response = await app.inject({
      method: 'POST',
      url: '/voice',
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });
});
