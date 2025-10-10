// src/services/shopify-customers-sync.js
// Shopify Customers sync service with Bulk Operations and metafields detection

import { getPrismaClient } from '../db/prismaClient.js';
import { shopifyGraphql } from './shopify-graphql.js';
import { deriveAgeYears, normalizeGender, parseBirthdate } from '../lib/age-utils.js';
import { logger } from '../lib/logger.js';

const prisma = getPrismaClient();

// Default metafields configuration
const DEFAULT_METAFIELDS_CONFIG = {
  namespaces: ['sms_blossom', 'customer', 'custom'],
  genderKeys: ['gender', 'sex'],
  birthdateKeys: ['birthdate', 'dob', 'birthday'],
};

/**
 * Sync customers from Shopify using Bulk Operations
 * @param {Object} params - Sync parameters
 * @param {string} params.shopDomain - Shopify shop domain
 * @param {string} params.accessToken - Shopify access token
 * @param {Object} params.metafieldsConfig - Metafields configuration
 * @returns {Promise<Object>} Sync results
 */
export async function shopifyCustomersSync({
  shopDomain,
  accessToken,
  metafieldsConfig = DEFAULT_METAFIELDS_CONFIG,
}) {
  const startTime = Date.now();
  let processed = 0;
  let updated = 0;
  let created = 0;
  let errors = 0;
  const errorDetails = [];

  try {
    logger.info({ shopDomain }, 'Starting Shopify customers sync');

    // Get shop from database
    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
    });

    if (!shop) {
      throw new Error(`Shop not found: ${shopDomain}`);
    }

    // Step 1: Create bulk operation
    const bulkOperationId = await createBulkOperation({
      shopDomain,
      accessToken,
    });

    if (!bulkOperationId) {
      throw new Error('Failed to create bulk operation');
    }

    // Step 2: Poll for completion
    const bulkOperation = await pollBulkOperation({
      shopDomain,
      accessToken,
      bulkOperationId,
    });

    if (bulkOperation.status !== 'COMPLETED') {
      throw new Error(`Bulk operation failed: ${bulkOperation.status}`);
    }

    // Step 3: Download and process results
    const customers = await downloadBulkOperationResults({
      shopDomain,
      accessToken,
      url: bulkOperation.url,
    });

    logger.info(
      { shopDomain, customerCount: customers.length },
      'Downloaded customers from bulk operation',
    );

    // Step 4: Process each customer
    for (const customer of customers) {
      try {
        const result = await processCustomer({
          shop,
          customer,
          metafieldsConfig,
        });

        processed++;
        if (result.created) created++;
        if (result.updated) updated++;
      } catch (error) {
        errors++;
        errorDetails.push({
          customerId: customer.id,
          error: error.message,
        });
        logger.error(
          { error: error.message, customerId: customer.id },
          'Failed to process customer',
        );
      }
    }

    const executionTime = Date.now() - startTime;

    logger.info(
      {
        shopDomain,
        processed,
        created,
        updated,
        errors,
        executionTime,
      },
      'Shopify customers sync completed',
    );

    return {
      processed,
      created,
      updated,
      errors,
      errorDetails: errorDetails.slice(0, 10), // Limit error details
      executionTime,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    logger.error(
      {
        error: error.message,
        shopDomain,
        processed,
        created,
        updated,
        errors,
        executionTime,
      },
      'Shopify customers sync failed',
    );

    throw error;
  }
}

/**
 * Create bulk operation for customers
 */
async function createBulkOperation({ shopDomain, accessToken }) {
  const query = `
    mutation {
      bulkOperationRunQuery(
        query: """
          {
            customers(first: 250) {
              edges {
                node {
                  id
                  email
                  phone
                  firstName
                  lastName
                  metafields(first: 50) {
                    edges {
                      node {
                        namespace
                        key
                        value
                        type
                      }
                    }
                  }
                }
              }
            }
          }
        """
      ) {
        bulkOperation {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyGraphql({
    shopDomain,
    accessToken,
    query,
  });

  if (result.bulkOperationRunQuery.userErrors?.length > 0) {
    throw new Error(`Bulk operation creation failed: ${JSON.stringify(result.bulkOperationRunQuery.userErrors)}`);
  }

  return result.bulkOperationRunQuery.bulkOperation?.id;
}

/**
 * Poll bulk operation status
 */
async function pollBulkOperation({ shopDomain, accessToken, bulkOperationId }) {
  const query = `
    query {
      currentBulkOperation {
        id
        status
        errorCode
        createdAt
        completedAt
        objectCount
        fileSize
        url
        partialDataUrl
      }
    }
  `;

  const maxAttempts = 60; // 5 minutes with 5-second intervals
  let attempts = 0;

  while (attempts < maxAttempts) {
    const result = await shopifyGraphql({
      shopDomain,
      accessToken,
      query,
    });

    const operation = result.currentBulkOperation;
    
    if (operation?.status === 'COMPLETED') {
      return operation;
    }
    
    if (operation?.status === 'FAILED') {
      throw new Error(`Bulk operation failed: ${operation.errorCode}`);
    }

    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    attempts++;
  }

  throw new Error('Bulk operation timeout');
}

/**
 * Download bulk operation results
 */
async function downloadBulkOperationResults({ shopDomain, accessToken, url }) {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to download bulk operation results: ${response.statusText}`);
  }

  const text = await response.text();
  const lines = text.trim().split('\n');
  
  return lines.map(line => {
    try {
      return JSON.parse(line);
    } catch (error) {
      logger.warn({ line, error: error.message }, 'Failed to parse bulk operation line');
      return null;
    }
  }).filter(Boolean);
}

/**
 * Process individual customer
 */
async function processCustomer({ shop, customer, metafieldsConfig }) {
  const { id, email, phone, firstName, lastName, metafields } = customer;
  
  // Extract metafields data
  const metafieldsData = extractMetafieldsData(metafields, metafieldsConfig);
  
  // Normalize gender
  const gender = normalizeGender(metafieldsData.gender);
  
  // Parse birthdate
  const birthdate = parseBirthdate(metafieldsData.birthdate);
  const ageYears = birthdate ? deriveAgeYears(birthdate) : null;
  
  // Prepare contact data
  const contactData = {
    shopId: shop.id,
    customerId: id,
    email: email || null,
    phoneE164: phone || null,
    firstName: firstName || null,
    lastName: lastName || null,
    gender,
    birthdate,
    ageYears,
  };

  // Find existing contact
  const existingContact = await prisma.contact.findFirst({
    where: {
      shopId: shop.id,
      OR: [
        { customerId: id },
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phoneE164: phone }] : []),
      ],
    },
  });

  if (existingContact) {
    // Update existing contact
    await prisma.contact.update({
      where: { id: existingContact.id },
      data: contactData,
    });
    
    return { created: false, updated: true };
  } else {
    // Create new contact
    await prisma.contact.create({
      data: contactData,
    });
    
    return { created: true, updated: false };
  }
}

/**
 * Extract metafields data based on configuration
 */
function extractMetafieldsData(metafields, config) {
  const result = { gender: null, birthdate: null };
  
  if (!metafields?.edges) return result;
  
  for (const edge of metafields.edges) {
    const { namespace, key, value } = edge.node;
    
    // Check if namespace matches
    if (!config.namespaces.includes(namespace)) continue;
    
    // Check for gender
    if (config.genderKeys.includes(key) && !result.gender) {
      result.gender = value;
    }
    
    // Check for birthdate
    if (config.birthdateKeys.includes(key) && !result.birthdate) {
      result.birthdate = value;
    }
  }
  
  return result;
}
