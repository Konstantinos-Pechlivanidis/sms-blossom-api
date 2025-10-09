// src/services/reports.js
// Reporting and attribution service

import { getPrismaClient } from '../db/prismaClient.js';
// import { parseRange } from '../lib/dates.js';
import { parseUtmFromUrl } from '../lib/url.js';

const prisma = getPrismaClient();

/** Overview KPIs */
export async function getOverview({ shopId, from, to }) {
  const whereSent = { shopId, sentAt: { gte: from, lt: to } };
  const whereDelivered = { shopId, deliveredAt: { gte: from, lt: to } };
  const whereFailed = { shopId, failedAt: { gte: from, lt: to } };
  const [sent, delivered, failed] = await Promise.all([
    prisma.message.count({ where: whereSent }),
    prisma.message.count({ where: whereDelivered }),
    prisma.message.count({ where: whereFailed }),
  ]);

  const deliveryRate = sent ? delivered / sent : 0;

  // Opt-ins in period (best-effort)
  const optedIn = await prisma.contact.count({
    where: { shopId, smsConsentState: 'opted_in', smsConsentAt: { gte: from, lt: to } },
  });
  const optedOut = await prisma.contact.count({
    where: { shopId, optedOut: true, unsubscribedAt: { gte: from, lt: to } },
  });

  // Discount attribution metrics
  const attributedOrders = await getAttributedOrders({ shopId, from, to });
  const revenueByCampaign = await getRevenueByCampaign({ shopId, from, to });
  const discountUtilization = await getDiscountUtilization({ shopId, from, to });

  return {
    sent,
    delivered,
    failed,
    deliveryRate,
    cost: 0, // Cost tracking not implemented yet
    optIns: optedIn,
    optOuts: optedOut,
    attributedOrders,
    revenueByCampaign,
    discountUtilization,
  };
}

/** Extract candidate orders from events payloads within range */
async function fetchOrdersFromEvents({ shopId, from, to }) {
  const events = await prisma.event.findMany({
    where: {
      shopId,
      topic: { in: ['orders/create', 'orders/paid'] },
      // createdAt or receivedAt depending on schema
      createdAt: { gte: from, lt: to },
    },
    take: 5000, // safety cap
    orderBy: { createdAt: 'desc' },
  });
  // Normalize minimal shape
  const rows = [];
  for (const e of events) {
    const p = e.payload ?? e.raw ?? e.payload_json ?? {};
    const order = p || {};
    const id = String(order.id || order.admin_graphql_api_id || order.order_number || e.id);
    const totalPrice = Number(order.total_price || order.current_total_price || 0);
    const currency =
      order.currency || order.current_total_price_set?.shop_money?.currency_code || 'USD';
    const codes = (order.discount_codes || []).map((x) => x.code).filter(Boolean);
    const checkoutId = order.checkout_id || order.checkoutId || null;
    const landing = order.landing_site || order.landingSite || '';
    const utm = landing ? parseUtmFromUrl(landing) : {};
    rows.push({ id, totalPrice, currency, discountCodes: codes, checkoutId, utm });
  }
  return rows;
}

/** Campaign attribution:
 *  - By discount code: join Discount rows (campaign.linked via campaign.discountId)
 *  - By UTM utm_campaign == campaign.id (string)
 */
export async function getCampaignAttribution({ shopId, from, to }) {
  const [orders, campaigns, discounts] = await Promise.all([
    fetchOrdersFromEvents({ shopId, from, to }),
    prisma.campaign.findMany({ where: { shopId } }),
    prisma.discount.findMany({ where: { shopId } }),
  ]);

  const discByCode = new Map(discounts.map((d) => [String(d.code).toUpperCase(), d]));
  const campById = new Map(campaigns.map((c) => [String(c.id), c]));

  const perCampaign = new Map(); // id -> { revenue, orders, via: {discount, utm} }

  function bump(id, amount, via) {
    const key = String(id);
    if (!perCampaign.has(key))
      perCampaign.set(key, { revenue: 0, orders: 0, via: { discount: 0, utm: 0 } });
    const row = perCampaign.get(key);
    row.revenue += amount;
    row.orders += 1;
    row.via[via] += 1;
  }

  for (const o of orders) {
    // Discount → campaign
    let matched = false;
    for (const code of o.discountCodes || []) {
      const disc = discByCode.get(String(code).toUpperCase());
      if (!disc) continue;
      const camp = campaigns.find((c) => c.discountId === disc.id);
      if (camp) {
        bump(camp.id, o.totalPrice, 'discount');
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // UTM → campaign.id literal (we append utm_campaign=campaign.id in Sprint F)
    const utmCamp = String(o.utm?.utm_campaign || '');
    if (utmCamp && campById.has(utmCamp)) {
      bump(utmCamp, o.totalPrice, 'utm');
    }
  }

  // Also surface send/delivered for each campaign in range
  const msgs = await prisma.message
    .groupBy({
      by: ['campaignId', 'status'],
      where: { shopId, kind: 'campaign', sentAt: { gte: from, lt: to } },
    })
    .catch(() => []);
  const sentMap = {};
  for (const m of msgs) {
    const id = m.campaignId || '';
    if (!sentMap[id]) sentMap[id] = { sent: 0, delivered: 0, failed: 0 };
    if (m.status === 'sent') sentMap[id].sent += 1;
    if (m.status === 'delivered') sentMap[id].delivered += 1;
    if (m.status === 'failed') sentMap[id].failed += 1;
  }

  // Shortlink clicks (lifetime; cannot time-slice without per-click timestamps)
  const shortByCamp = {};
  const shorts = await prisma.shortlink.findMany({ where: { shopId } });
  for (const s of shorts) {
    if (!s.campaignId) continue;
    if (!shortByCamp[s.campaignId]) shortByCamp[s.campaignId] = 0;
    shortByCamp[s.campaignId] += s.clicks || 0;
  }

  const out = [];
  for (const [id, stats] of perCampaign.entries()) {
    out.push({
      campaignId: id,
      name: campById.get(id)?.name || '',
      revenue: stats.revenue,
      orders: stats.orders,
      via: stats.via,
      clicks_lifetime: shortByCamp[id] || 0,
      messaging: sentMap[id] || { sent: 0, delivered: 0, failed: 0 },
    });
  }
  return out.sort((a, b) => b.revenue - a.revenue);
}

/** Automation attribution (focus: Abandoned Checkout) */
export async function getAutomationAttribution({ shopId, from, to }) {
  const [orders, messages] = await Promise.all([
    fetchOrdersFromEvents({ shopId, from, to }),
    prisma.message.findMany({
      where: {
        shopId,
        kind: 'automation',
        triggerKey: 'abandoned_checkout',
        sentAt: { gte: from, lt: to },
      },
      select: { id: true, metadata: true, sentAt: true, contactId: true },
    }),
  ]);
  // Index messages by checkoutId
  const byCheckout = new Map();
  for (const m of messages) {
    const ck = m?.metadata?.checkoutId || m?.metadata?.checkout_id;
    if (!ck) continue;
    byCheckout.set(String(ck), m);
  }
  let revenue = 0,
    ordersCount = 0;
  for (const o of orders) {
    if (!o.checkoutId) continue;
    if (byCheckout.has(String(o.checkoutId))) {
      revenue += o.totalPrice;
      ordersCount += 1;
    }
  }
  return { automation: 'abandoned_checkout', orders: ordersCount, revenue };
}

/** Messaging time series (daily) */
export async function getMessagingTimeseries({ shopId, from, to }) {
  const rows = await prisma.$queryRaw`
    SELECT
      date_trunc('day', sent_at) AS day,
      count(*) FILTER (WHERE status='sent')       AS sent,
      count(*) FILTER (WHERE status='delivered')  AS delivered,
      count(*) FILTER (WHERE status='failed')     AS failed
    FROM "Message"
    WHERE "shopId" = ${shopId}
      AND sent_at >= ${from} AND sent_at < ${to}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
  return rows.map((r) => ({
    day: r.day,
    sent: Number(r.sent || 0),
    delivered: Number(r.delivered || 0),
    failed: Number(r.failed || 0),
    cost: 0, // Cost tracking not implemented yet
  }));
}

/** Get attributed orders (orders with discount codes from our campaigns) */
export async function getAttributedOrders({ shopId, from, to }) {
  const orders = await fetchOrdersFromEvents({ shopId, from, to });
  
  // Get all discount codes from our campaigns
  const campaignDiscounts = await prisma.discount.findMany({
    where: { shopId },
    include: { campaign: true }
  });
  
  const discountCodes = new Set(
    campaignDiscounts.map(d => d.code.toUpperCase())
  );
  
  let attributedCount = 0;
  let totalRevenue = 0;
  
  for (const order of orders) {
    const hasAttributedDiscount = order.discountCodes?.some(code => 
      discountCodes.has(code.toUpperCase())
    );
    
    if (hasAttributedDiscount) {
      attributedCount++;
      totalRevenue += order.totalPrice;
    }
  }
  
  return {
    count: attributedCount,
    revenue: totalRevenue,
    percentage: orders.length > 0 ? (attributedCount / orders.length) * 100 : 0
  };
}

/** Get revenue by campaign */
export async function getRevenueByCampaign({ shopId, from, to }) {
  const orders = await fetchOrdersFromEvents({ shopId, from, to });
  const campaigns = await prisma.campaign.findMany({
    where: { shopId },
    include: { discount: true }
  });
  
  const campaignRevenue = new Map();
  
  for (const campaign of campaigns) {
    if (!campaign.discount) continue;
    
    const discountCode = campaign.discount.code.toUpperCase();
    let revenue = 0;
    let orderCount = 0;
    
    for (const order of orders) {
      const hasDiscount = order.discountCodes?.some(code => 
        code.toUpperCase() === discountCode
      );
      
      if (hasDiscount) {
        revenue += order.totalPrice;
        orderCount++;
      }
    }
    
    if (revenue > 0) {
      campaignRevenue.set(campaign.id, {
        campaignId: campaign.id,
        campaignName: campaign.name,
        revenue,
        orderCount,
        discountCode: campaign.discount.code
      });
    }
  }
  
  return Array.from(campaignRevenue.values())
    .sort((a, b) => b.revenue - a.revenue);
}

/** Get discount utilization metrics */
export async function getDiscountUtilization({ shopId, from, to }) {
  // Get all discount code pools
  const pools = await prisma.discountCodePool.findMany({
    where: { shopId },
    include: {
      codes: {
        where: {
          OR: [
            { status: 'used' },
            { status: 'assigned' }
          ]
        }
      }
    }
  });
  
  let totalCodes = 0;
  let usedCodes = 0;
  let reservedCodes = 0;
  
  for (const pool of pools) {
    totalCodes += pool.totalCodes;
    usedCodes += pool.usedCodes;
    reservedCodes += pool.reservedCodes;
  }
  
  const utilizationRate = totalCodes > 0 ? (usedCodes / totalCodes) * 100 : 0;
  const reservationRate = totalCodes > 0 ? (reservedCodes / totalCodes) * 100 : 0;
  
  return {
    totalCodes,
    usedCodes,
    reservedCodes,
    availableCodes: totalCodes - usedCodes - reservedCodes,
    utilizationRate,
    reservationRate
  };
}
