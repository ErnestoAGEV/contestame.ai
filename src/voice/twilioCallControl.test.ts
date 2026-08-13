import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildHangupTwiml, hangupWithMessage } from './twilioCallControl.js';

describe('buildHangupTwiml', () => {
  it('embeds the message inside a Say/Hangup TwiML response', () => {
    const twiml = buildHangupTwiml('Lo sentimos.');
    expect(twiml).toContain('<Say language="es-MX">Lo sentimos.</Say>');
    expect(twiml).toContain('<Hangup/>');
  });

  it('escapes special XML characters in the message', () => {
    const twiml = buildHangupTwiml('Tom & Jerry <test>');
    expect(twiml).toContain('<Say language="es-MX">Tom &amp; Jerry &lt;test&gt;</Say>');
    expect(twiml).not.toContain('Tom & Jerry <test>');
  });
});

describe('hangupWithMessage', () => {
  const ORIGINAL_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const ORIGINAL_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = 'ACtestaccountsid';
    process.env.TWILIO_AUTH_TOKEN = 'testauthtoken';
  });

  afterEach(() => {
    process.env.TWILIO_ACCOUNT_SID = ORIGINAL_ACCOUNT_SID;
    process.env.TWILIO_AUTH_TOKEN = ORIGINAL_AUTH_TOKEN;
    vi.unstubAllGlobals();
  });

  it('sends the expected request to Twilio', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);

    await hangupWithMessage('CAtestcallsid', 'Lo sentimos.');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe(
      'https://api.twilio.com/2010-04-01/Accounts/ACtestaccountsid/Calls/CAtestcallsid.json'
    );

    expect(options.method).toBe('POST');

    const expectedAuth = Buffer.from('ACtestaccountsid:testauthtoken').toString('base64');
    expect(options.headers.Authorization).toBe(`Basic ${expectedAuth}`);
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    const expectedTwiml = buildHangupTwiml('Lo sentimos.');
    const body = new URLSearchParams(options.body);
    expect(body.get('Twiml')).toBe(expectedTwiml);
  });

  it('throws when the Twilio API responds with a non-ok status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(hangupWithMessage('CAtestcallsid', 'Lo sentimos.')).rejects.toThrow(
      'Twilio call update failed: 500 internal error'
    );
  });
});
