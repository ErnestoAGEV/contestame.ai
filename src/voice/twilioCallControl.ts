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
