import { describe, it, expect } from 'vitest';
import { buildHangupTwiml } from './twilioCallControl.js';

describe('buildHangupTwiml', () => {
  it('embeds the message inside a Say/Hangup TwiML response', () => {
    const twiml = buildHangupTwiml('Lo sentimos.');
    expect(twiml).toContain('<Say language="es-MX">Lo sentimos.</Say>');
    expect(twiml).toContain('<Hangup/>');
  });
});
