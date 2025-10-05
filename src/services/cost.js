// src/services/cost.js
// Basic GSM/Unicode segments estimator

/**
 * Basic GSM/Unicode segments estimator.
 *  GSM-7: 160/153
 *  UCS-2: 70/67
 *  We return { perMessageSegments, totalSegments, estCost }.
 *  Price is env MITTO_DEFAULT_PRICE_EUR (per SMS segment) or 0.03 default.
 */
const GSM7 =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

function isGsm7(text) {
  for (const ch of text || '') {
    if (GSM7.indexOf(ch) === -1) return false;
  }
  return true;
}

export function estimateSegments(text) {
  const gsm = isGsm7(text);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  if (!text) return { encoding: gsm ? 'GSM-7' : 'UCS-2', perMessageSegments: 1, chars: 0 };
  const len = [...text].length;
  if (len <= single)
    return { encoding: gsm ? 'GSM-7' : 'UCS-2', perMessageSegments: 1, chars: len };
  const segs = Math.ceil((len - single) / multi) + 1;
  return { encoding: gsm ? 'GSM-7' : 'UCS-2', perMessageSegments: segs, chars: len };
}

export function estimateCost({ recipients, body }) {
  const { perMessageSegments } = estimateSegments(body || '');
  const price = Number(process.env.MITTO_DEFAULT_PRICE_EUR || '0.03'); // EUR per segment
  const totalSegments = perMessageSegments * Math.max(0, recipients);
  const estCost = totalSegments * price;
  return { perMessageSegments, totalSegments, estCost };
}
