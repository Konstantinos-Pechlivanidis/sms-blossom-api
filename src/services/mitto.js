export async function sendSms({ to, text, meta, callbackUrl }) {
  const url = process.env.MITTO_API_URL || 'https://rest.mittoapi.com/sms';
  const key = process.env.MITTO_API_KEY;
  const callback = callbackUrl || `${process.env.APP_URL}/webhooks/mitto/dlr`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, text, callback_url: callback, meta }),
  });

  if (!res.ok) {
    const error = await res.text().catch(() => 'Unknown error');
    throw new Error(`Mitto API error: ${res.status} ${error}`);
  }

  const data = await res.json().catch(() => ({}));
  return {
    id: data.id || `mitto_${Date.now()}`,
    providerMsgId: data.id,
    to,
    text,
    callback,
    url,
    keySet: Boolean(key),
  };
}
