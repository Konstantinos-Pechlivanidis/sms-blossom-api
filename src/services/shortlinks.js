// src/services/shortlinks.js
// Shortlinks service for campaign URL shortening

import { getPrismaClient } from '../db/prismaClient.js';
import { customAlphabet } from 'nanoid';

const prisma = getPrismaClient();
const nano = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);

export async function createShortlink({ shopId = null, url, campaignId = null, expiresAt = null }) {
  const slug = nano();
  const row = await prisma.shortlink.create({
    data: { slug, url, campaignId: campaignId || null, shopId, expiresAt },
  });
  return {
    slug: row.slug,
    url: `${process.env.APP_URL?.replace(/\/+$/, '')}/s/${row.slug}`,
  };
}

export async function resolveShortlink(slug) {
  const row = await prisma.shortlink.findUnique({ where: { slug } });
  if (!row) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;
  await prisma.shortlink.update({
    where: { slug },
    data: { clicks: { increment: 1 } },
  });
  return row.url;
}
