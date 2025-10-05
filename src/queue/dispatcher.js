// src/queue/dispatcher.js
// Map topics to processors

import { processOrderPaid } from '../queue/processors/event.orders.paid.js';
import { processOrderCreated } from '../queue/processors/event.orders.create.js';
import { processCheckoutsUpdate } from '../queue/processors/event.checkouts.update.js';
import { processFulfillmentsUpdate } from '../queue/processors/event.fulfillments.update.js';
import { processInventoryLevelsUpdate } from '../queue/processors/event.inventory_levels.update.js';
import {
  processGdprDataRequest,
  processGdprCustomerRedact,
  processGdprShopRedact,
} from '../queue/processors/gdpr.js';

export async function dispatchEvent({ topic, shopDomain, shopId, payload }) {
  // Shopify sends topics like "orders/paid", we may also receive ENUM; normalize:
  const t = String(topic).toLowerCase().replace(/_/g, '/');

  if (t === 'orders/create') return processOrderCreated({ shopDomain, shopId, payload });
  if (t === 'orders/paid') return processOrderPaid({ shopDomain, shopId, payload });
  if (t === 'checkouts/update') return processCheckoutsUpdate({ shopDomain, shopId, payload });
  if (t === 'fulfillments/update')
    return processFulfillmentsUpdate({ shopDomain, shopId, payload });
  if (t === 'inventory_levels/update')
    return processInventoryLevelsUpdate({ shopDomain, shopId, payload });
  if (t === 'customers/data_request')
    return processGdprDataRequest({ shopDomain, shopId, payload });
  if (t === 'customers/redact') return processGdprCustomerRedact({ shopDomain, shopId, payload });
  if (t === 'shop/redact') return processGdprShopRedact({ shopDomain, shopId, payload });

  // no-op for other topics for now
}
