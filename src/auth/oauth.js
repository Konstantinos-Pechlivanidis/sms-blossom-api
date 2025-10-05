import cookie from 'cookie';
import { nanoid } from 'nanoid';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getPrismaClient } from '../db/prismaClient.js';
import { encryptToString } from '../lib/crypto.js';
import { registerWebhooks } from './shop-webhooks.js';

const TEN_MINUTES = 10 * 60; // seconds

function setStateCookie(res, state) {
  const secure = process.env.NODE_ENV === 'production';
  const serialized = cookie.serialize('__sb_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: TEN_MINUTES,
    path: '/',
  });
  res.setHeader('Set-Cookie', serialized);
}

function getStateCookie(req) {
  const raw = req.headers.cookie || '';
  const parsed = cookie.parse(raw);
  return parsed['__sb_state'];
}

function isValidShopDomain(shop) {
  return typeof shop === 'string' && /^(?:[a-z0-9][a-z0-9-]*\.)*myshopify\.com$/i.test(shop);
}

export async function install(req, res) {
  const shop = String(req.query.shop || '');
  if (!isValidShopDomain(shop)) return res.status(400).send('Invalid shop');
  const state = nanoid();
  setStateCookie(res, state);
  const url = `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(process.env.SHOPIFY_API_KEY)}&scope=${encodeURIComponent(process.env.SHOPIFY_SCOPES || '')}&redirect_uri=${encodeURIComponent(`${process.env.APP_URL}/auth/callback`)}&state=${encodeURIComponent(state)}`;
  res.redirect(302, url);
}

function verifyOAuthHmac(query, secret) {
  const entries = Object.entries(query)
    .filter(([k]) => k !== 'hmac')
    .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const message = entries.map(([k, v]) => `${k}=${v}`).join('&');
  const digest = createHmac('sha256', secret).update(message).digest('hex');
  const provided = String(query.hmac || '');
  if (digest.length !== provided.length) return false;
  const a = Buffer.from(digest, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  return timingSafeEqual(a, b);
}

export async function callback(req, res) {
  const { shop, code, state } = req.query;
  const hmac = req.query.hmac;
  if (!isValidShopDomain(String(shop))) return res.status(400).send('Invalid shop');
  if (!code || !state || !hmac) return res.status(400).send('Missing params');

  const cookieState = getStateCookie(req);
  if (!cookieState || cookieState !== state) return res.status(400).send('Invalid state');

  if (!verifyOAuthHmac(req.query, process.env.SHOPIFY_API_SECRET || '')) {
    return res.status(400).send('Invalid HMAC');
  }

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });
  if (!tokenRes.ok) return res.status(400).send('Token exchange failed');
  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token;

  const prisma = getPrismaClient();
  const encrypted = encryptToString(accessToken);
  await prisma.shop.upsert({
    where: { domain: String(shop) },
    update: { tokenOffline: encrypted },
    create: { domain: String(shop), tokenOffline: encrypted },
  });

  try {
    await registerWebhooks({ shopDomain: String(shop), accessToken });
  } catch (e) {
    console.warn('[webhooks] registration warning', e?.details || e?.message || e);
  }

  res.status(200).send(`<html><body><h3>Installed ✓</h3><p>${shop}</p></body></html>`);
}
