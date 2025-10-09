import { getPrismaClient } from '../db/prismaClient.js';
import { logger } from '../lib/logger.js';

const prisma = getPrismaClient();

/**
 * LinkBuilder service for creating discount URLs and managing shortlinks
 */
export class LinkBuilder {
  constructor(shopDomain, baseUrl = null) {
    this.shopDomain = shopDomain;
    this.baseUrl = baseUrl || `https://${shopDomain}`;
  }

  /**
   * Build a discount URL with optional redirect path and UTM parameters
   * @param {string} code - Discount code
   * @param {string} redirectPath - Path to redirect to (default: "/checkout")
   * @param {Object} utmJson - UTM parameters to append
   * @returns {string} Complete discount URL
   */
  buildDiscountUrl(code, redirectPath = '/checkout', utmJson = {}) {
    // Encode the redirect path
    const encodedRedirect = encodeURIComponent(redirectPath);
    
    // Build the base discount URL
    const discountUrl = `${this.baseUrl}/discount/${code}?redirect=${encodedRedirect}`;
    
    // Add UTM parameters if provided
    if (utmJson && Object.keys(utmJson).length > 0) {
      const utmParams = new URLSearchParams();
      
      if (utmJson.source) utmParams.append('utm_source', utmJson.source);
      if (utmJson.medium) utmParams.append('utm_medium', utmJson.medium);
      if (utmJson.campaign) utmParams.append('utm_campaign', utmJson.campaign);
      if (utmJson.term) utmParams.append('utm_term', utmJson.term);
      if (utmJson.content) utmParams.append('utm_content', utmJson.content);
      
      // Add any custom parameters
      if (utmJson.custom) {
        Object.entries(utmJson.custom).forEach(([key, value]) => {
          utmParams.append(key, value);
        });
      }
      
      return `${discountUrl}&${utmParams.toString()}`;
    }
    
    return discountUrl;
  }

  /**
   * Create a shortlink for a discount URL
   * @param {string} discountUrl - The full discount URL
   * @param {string} campaignId - Optional campaign ID for tracking
   * @param {Object} metadata - Additional metadata for the shortlink
   * @returns {Promise<Object>} Shortlink object with slug and URL
   */
  async createShortlink(discountUrl, campaignId = null, metadata = {}) {
    try {
      // Generate a unique slug
      const slug = await this.generateUniqueSlug();
      
      // Create the shortlink record
      const shortlink = await prisma.shortlink.create({
        data: {
          slug,
          url: discountUrl,
          shopId: this.shopDomain, // This should be the shop ID, not domain
          campaignId,
          expiresAt: metadata.expiresAt || null,
        }
      });

      logger.info({
        shortlinkId: shortlink.slug,
        originalUrl: discountUrl,
        campaignId,
      }, 'Shortlink created');

      return {
        slug: shortlink.slug,
        shortUrl: `${this.baseUrl}/s/${shortlink.slug}`,
        originalUrl: discountUrl,
        clicks: 0,
        createdAt: shortlink.createdAt,
        expiresAt: shortlink.expiresAt,
      };
    } catch (error) {
      logger.error({
        error: error.message,
        discountUrl,
        campaignId,
      }, 'Failed to create shortlink');
      throw error;
    }
  }

  /**
   * Generate a unique slug for shortlinks
   * @returns {Promise<string>} Unique slug
   */
  async generateUniqueSlug() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let slug;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      // Generate a random slug (6-8 characters)
      const length = 6 + Math.floor(Math.random() * 3);
      slug = '';
      for (let i = 0; i < length; i++) {
        slug += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      // Check if slug already exists
      const existing = await prisma.shortlink.findUnique({
        where: { slug }
      });
      
      if (!existing) {
        return slug;
      }
      
      attempts++;
    } while (attempts < maxAttempts);

    // Fallback: use timestamp-based slug
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}${random}`;
  }

  /**
   * Track a shortlink click
   * @param {string} slug - Shortlink slug
   * @param {Object} clickData - Click tracking data
   * @returns {Promise<Object|null>} Original URL or null if not found
   */
  async trackClick(slug, clickData = {}) {
    try {
      const shortlink = await prisma.shortlink.findUnique({
        where: { slug }
      });

      if (!shortlink) {
        logger.warn({ slug }, 'Shortlink not found');
        return null;
      }

      // Check if expired
      if (shortlink.expiresAt && new Date() > shortlink.expiresAt) {
        logger.warn({ slug, expiresAt: shortlink.expiresAt }, 'Shortlink expired');
        return null;
      }

      // Increment click count
      await prisma.shortlink.update({
        where: { slug },
        data: {
          clicks: {
            increment: 1
          }
        }
      });

      logger.info({
        slug,
        originalUrl: shortlink.url,
        campaignId: shortlink.campaignId,
        clickData,
      }, 'Shortlink clicked');

      return {
        url: shortlink.url,
        campaignId: shortlink.campaignId,
        clicks: shortlink.clicks + 1,
      };
    } catch (error) {
      logger.error({
        error: error.message,
        slug,
        clickData,
      }, 'Failed to track shortlink click');
      throw error;
    }
  }

  /**
   * Get shortlink statistics
   * @param {string} campaignId - Optional campaign ID filter
   * @returns {Promise<Object>} Shortlink statistics
   */
  async getShortlinkStats(campaignId = null) {
    try {
      const where = { shopId: this.shopDomain };
      if (campaignId) {
        where.campaignId = campaignId;
      }

      const stats = await prisma.shortlink.aggregate({
        where,
        _count: {
          slug: true
        },
        _sum: {
          clicks: true
        }
      });

      return {
        totalShortlinks: stats._count.slug,
        totalClicks: stats._sum.clicks || 0,
        campaignId,
      };
    } catch (error) {
      logger.error({
        error: error.message,
        campaignId,
      }, 'Failed to get shortlink stats');
      throw error;
    }
  }

  /**
   * Clean up expired shortlinks
   * @returns {Promise<number>} Number of shortlinks cleaned up
   */
  async cleanupExpiredShortlinks() {
    try {
      const result = await prisma.shortlink.deleteMany({
        where: {
          shopId: this.shopDomain,
          expiresAt: {
            lt: new Date()
          }
        }
      });

      logger.info({
        deletedCount: result.count,
        shopDomain: this.shopDomain,
      }, 'Cleaned up expired shortlinks');

      return result.count;
    } catch (error) {
      logger.error({
        error: error.message,
        shopDomain: this.shopDomain,
      }, 'Failed to cleanup expired shortlinks');
      throw error;
    }
  }

  /**
   * Build a complete discount link with shortlink
   * @param {string} code - Discount code
   * @param {string} redirectPath - Redirect path
   * @param {Object} utmJson - UTM parameters
   * @param {string} campaignId - Campaign ID
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Complete link object
   */
  async buildCompleteDiscountLink(code, redirectPath = '/checkout', utmJson = {}, campaignId = null, metadata = {}) {
    try {
      // Build the discount URL
      const discountUrl = this.buildDiscountUrl(code, redirectPath, utmJson);
      
      // Create a shortlink
      const shortlink = await this.createShortlink(discountUrl, campaignId, metadata);
      
      return {
        code,
        discountUrl,
        shortlink,
        utmJson,
        campaignId,
        metadata,
      };
    } catch (error) {
      logger.error({
        error: error.message,
        code,
        redirectPath,
        utmJson,
        campaignId,
      }, 'Failed to build complete discount link');
      throw error;
    }
  }
}

/**
 * Factory function to create LinkBuilder instance
 * @param {string} shopDomain - Shop domain
 * @param {string} baseUrl - Optional base URL
 * @returns {LinkBuilder} LinkBuilder instance
 */
export function createLinkBuilder(shopDomain, baseUrl = null) {
  return new LinkBuilder(shopDomain, baseUrl);
}

/**
 * Utility function to resolve shortlink
 * @param {string} slug - Shortlink slug
 * @returns {Promise<Object|null>} Shortlink data or null
 */
export async function resolveShortlink(slug) {
  try {
    const shortlink = await prisma.shortlink.findUnique({
      where: { slug }
    });

    if (!shortlink) {
      return null;
    }

    // Check if expired
    if (shortlink.expiresAt && new Date() > shortlink.expiresAt) {
      return null;
    }

    return {
      url: shortlink.url,
      campaignId: shortlink.campaignId,
      clicks: shortlink.clicks,
      createdAt: shortlink.createdAt,
      expiresAt: shortlink.expiresAt,
    };
  } catch (error) {
    logger.error({
      error: error.message,
      slug,
    }, 'Failed to resolve shortlink');
    throw error;
  }
}
