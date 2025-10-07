import { PrismaClient } from '@prisma/client';
import { randomUUID as _randomUUID } from 'crypto';

const prisma = new PrismaClient();

/**
 * Test database seed script
 * Creates minimal test data for integration tests
 */
async function seedTestData() {
  console.log('🌱 Seeding test database...');

  try {
    // Create test shop
    const testShop = await prisma.shop.upsert({
      where: { domain: 'test-shop.myshopify.com' },
      update: {},
      create: {
        id: 'test-shop-123',
        domain: 'test-shop.myshopify.com',
        name: 'Test Shop',
        email: 'test@example.com',
        timezone: 'America/New_York',
        locale: 'en',
        currency: 'USD',
        installed: true,
        accessToken: 'test_access_token_123',
        scopes: 'read_products,write_orders,read_customers',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log('✅ Created test shop:', testShop.domain);

    // Create test contacts
    const contacts = await Promise.all([
      prisma.contact.upsert({
        where: {
          shopId_phoneE164: {
            shopId: testShop.id,
            phoneE164: '+1234567890',
          },
        },
        update: {},
        create: {
          shopId: testShop.id,
          phoneE164: '+1234567890',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          optedOut: false,
          smsConsentState: 'opted_in',
          smsConsentSource: 'checkout',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
      prisma.contact.upsert({
        where: {
          shopId_phoneE164: {
            shopId: testShop.id,
            phoneE164: '+1987654321',
          },
        },
        update: {},
        create: {
          shopId: testShop.id,
          phoneE164: '+1987654321',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
          optedOut: true,
          smsConsentState: 'opted_out',
          smsConsentSource: 'manual',
          unsubscribedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    ]);

    console.log('✅ Created test contacts:', contacts.length);

    // Create test templates for each trigger
    const triggers = [
      'abandoned_checkout',
      'order_created',
      'order_paid',
      'fulfillment_update',
      'welcome',
      'back_in_stock',
    ];

    const templates = await Promise.all(
      triggers.map((trigger) =>
        prisma.template.upsert({
          where: {
            shopId_trigger: {
              shopId: testShop.id,
              trigger: trigger,
            },
          },
          update: {},
          create: {
            shopId: testShop.id,
            trigger: trigger,
            name: `${trigger} template`,
            body: getTemplateBody(trigger),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }),
      ),
    );

    console.log('✅ Created test templates:', templates.length);

    // Create test segment
    const testSegment = await prisma.segment.upsert({
      where: {
        shopId_name: {
          shopId: testShop.id,
          name: 'Test Segment',
        },
      },
      update: {},
      create: {
        shopId: testShop.id,
        name: 'Test Segment',
        description: 'Test segment for integration tests',
        filterJson: {
          operator: 'and',
          conditions: [
            {
              field: 'smsConsentState',
              operator: 'equals',
              value: 'opted_in',
            },
            {
              field: 'optedOut',
              operator: 'equals',
              value: false,
            },
          ],
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log('✅ Created test segment:', testSegment.name);

    // Create test automation
    const testAutomation = await prisma.automation.upsert({
      where: {
        shopId_trigger: {
          shopId: testShop.id,
          trigger: 'abandoned_checkout',
        },
      },
      update: {},
      create: {
        shopId: testShop.id,
        trigger: 'abandoned_checkout',
        name: 'Test Abandoned Checkout Automation',
        isActive: true,
        delayMinutes: 30,
        templateId: templates.find((t) => t.trigger === 'abandoned_checkout')?.id,
        segmentId: testSegment.id,
        settingsJson: {
          quietHours: {
            enabled: false,
          },
          frequencyCap: {
            enabled: false,
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log('✅ Created test automation:', testAutomation.name);

    // Create test discount
    const testDiscount = await prisma.discount.upsert({
      where: {
        shopId_code: {
          shopId: testShop.id,
          code: 'TEST10',
        },
      },
      update: {},
      create: {
        shopId: testShop.id,
        code: 'TEST10',
        title: 'Test Discount',
        type: 'percentage',
        value: 10,
        scopeJson: {
          type: 'all',
        },
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        providerId: 'gid://shopify/DiscountCodeBasic/123456789',
        applyUrl: 'https://test-shop.myshopify.com/discount/TEST10',
        utmJson: {
          utm_source: 'sms',
          utm_medium: 'sms',
          utm_campaign: 'test_campaign',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log('✅ Created test discount:', testDiscount.code);

    // Create test campaign
    const testCampaign = await prisma.campaign.upsert({
      where: {
        shopId_name: {
          shopId: testShop.id,
          name: 'Test Campaign',
        },
      },
      update: {},
      create: {
        shopId: testShop.id,
        name: 'Test Campaign',
        description: 'Test campaign for integration tests',
        segmentId: testSegment.id,
        templateId: templates.find((t) => t.trigger === 'welcome')?.id,
        discountId: testDiscount.id,
        status: 'draft',
        batchSize: 100,
        utmJson: {
          utm_source: 'sms',
          utm_medium: 'sms',
          utm_campaign: 'test_campaign',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log('✅ Created test campaign:', testCampaign.name);

    console.log('🎉 Test database seeded successfully!');
    console.log(`   Shop: ${testShop.domain}`);
    console.log(`   Contacts: ${contacts.length}`);
    console.log(`   Templates: ${templates.length}`);
    console.log(`   Segments: 1`);
    console.log(`   Automations: 1`);
    console.log(`   Discounts: 1`);
    console.log(`   Campaigns: 1`);
  } catch (error) {
    console.error('❌ Error seeding test database:', error);
    throw error;
  }
}

function getTemplateBody(trigger) {
  const templates = {
    abandoned_checkout:
      'Hi {{ customer.first_name }}, you left items in your cart! Complete your purchase: {{ recovery_url }}',
    order_created: "Thank you for your order {{ order.number }}! We'll send updates soon.",
    order_paid: 'Your order {{ order.number }} has been paid! Tracking: {{ tracking_url }}',
    fulfillment_update: 'Your order {{ order.number }} is on the way! Track: {{ tracking_url }}',
    welcome: 'Welcome to {{ shop.name }}! Use code WELCOME10 for 10% off.',
    back_in_stock: 'Good news! {{ product.title }} is back in stock: {{ product.url }}',
  };

  return templates[trigger] || 'Hello {{ customer.first_name }}!';
}

async function main() {
  try {
    await seedTestData();
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { seedTestData };
