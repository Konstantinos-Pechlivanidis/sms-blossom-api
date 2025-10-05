// src/services/templates.js
// Liquid renderer + defaults for SMS templates

import { Liquid } from 'liquidjs';

const engine = new Liquid({
  cache: false,
  greedy: true,
  trimOutputLeft: false,
  trimOutputRight: false,
});

// Default templates (can move to DB later)
const defaults = {
  order_paid:
    '🎉 Ευχαριστούμε για την παραγγελία {{ order.name }}! Θα λάβεις ενημέρωση όταν αποσταλεί. Καλή συνέχεια!',
  abandoned_checkout: 'Ξέμεινε κάτι στο καλάθι σου; Ολοκλήρωσε εδώ 👉 {{ recoveryUrl }}',
  fulfillment_update:
    'Η αποστολή σου για την παραγγελία {{ order.name }} ενημερώθηκε. Tracking: {{ trackingNumber }}',
  back_in_stock: 'Επιστροφή σε απόθεμα! {{ product.title }} 👉 {{ product.url }}',
  welcome:
    'Καλώς ήρθες! 🎉 Θα λαμβάνεις νέα & προσφορές. Μπορείς οποτεδήποτε να κάνεις unsubscribe.',
  campaign:
    '{{ campaign.name }} — {{ discount.code | default: "" }} {{ discount.apply_url | default: "" }}',
};

export async function renderTemplate(key, vars) {
  const tpl = defaults[key] || '';
  const parsed = await engine.parse(tpl);
  return engine.render(parsed, vars || {});
}

export const templateDefaults = defaults;
