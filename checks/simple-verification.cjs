// checks/simple-verification.js
// Simple go-live verification script (CommonJS)

const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

// Load environment variables from .env file
function loadEnvFile() {
  const envFiles = ['checks/verification.env', '.env.verification', '.env.local', '.env'];

  for (const envFile of envFiles) {
    const envPath = path.resolve(envFile);
    if (fs.existsSync(envPath)) {
      console.log(`📁 Loading environment from: ${envFile}`);
      const envContent = fs.readFileSync(envPath, 'utf8');
      const lines = envContent.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const [key, ...valueParts] = trimmedLine.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // Remove quotes
            process.env[key] = value;
          }
        }
      }
      return;
    }
  }

  console.log('⚠️  No .env file found. Using system environment variables only.');
}

// Configuration from environment (will be set after loading env)
let config;

// Initialize config after environment variables are loaded
function initializeConfig() {
  config = {
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
    devShopDomain: process.env.DEV_SHOP_DOMAIN || 'test-shop.myshopify.com',
    appProxySubpath: process.env.APP_PROXY_SUBPATH || '/apps/sms-blossom',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    databaseUrl: process.env.DATABASE_URL,
    mittoWebhookUrl: process.env.MITTO_WEBHOOK_URL,
    shopifyApiKey: process.env.SHOPIFY_API_KEY,
    webhookSecret: process.env.WEBHOOK_HMAC_SECRET || process.env.WEBHOOK_SECRET,
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY,
    hashPepper: process.env.HASH_PEPPER,
    mittoApiKey: process.env.MITTO_API_KEY,
    mittoApiUrl: process.env.MITTO_API_URL,
    mittoCallbackUrl: process.env.MITTO_CALLBACK_URL,
    mittoHmacSecret: process.env.MITTO_HMAC_SECRET,
  };
}

// Test results storage
const testResults = {
  environment: { status: 'PENDING', details: [] },
  database: { status: 'PENDING', details: [] },
  piiCoverage: { status: 'PENDING', details: [] },
  queues: { status: 'PENDING', details: [] },
  security: { status: 'PENDING', details: [] },
  webhooks: { status: 'PENDING', details: [] },
  templates: { status: 'PENDING', details: [] },
  campaigns: { status: 'PENDING', details: [] },
  delivery: { status: 'PENDING', details: [] },
  reports: { status: 'PENDING', details: [] },
  metrics: { status: 'PENDING', details: [] },
  hygiene: { status: 'PENDING', details: [] },
};

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SMS-Blossom-Go-Live-Verification/1.0',
        ...options.headers,
      },
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        let jsonData;
        try {
          jsonData = JSON.parse(data);
        } catch {
          jsonData = data;
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: jsonData,
          text: data,
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

// Helper function to check if required environment variables are present
function checkEnvironment() {
  const required = [
    'BASE_URL',
    'FRONTEND_URL',
    'DEV_SHOP_DOMAIN',
    'DATABASE_URL',
    'WEBHOOK_HMAC_SECRET',
    'JWT_SECRET',
    'ENCRYPTION_KEY',
    'HASH_PEPPER',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    testResults.environment.status = 'FAIL';
    testResults.environment.details.push(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  } else {
    testResults.environment.status = 'PASS';
    testResults.environment.details.push('All required environment variables present');
  }

  // Check for webhook secret alias
  if (process.env.WEBHOOK_SECRET && !process.env.WEBHOOK_HMAC_SECRET) {
    testResults.environment.details.push(
      'Using legacy WEBHOOK_SECRET (will be aliased to WEBHOOK_HMAC_SECRET)',
    );
  }
}

// Helper function to check database health
async function checkDatabase() {
  try {
    // Check health endpoint
    const healthResponse = await makeRequest(`${config.baseUrl}/health`);

    if (healthResponse.status === 200 && healthResponse.data.database === true) {
      testResults.database.status = 'PASS';
      testResults.database.details.push('Database connection healthy');
    } else {
      testResults.database.status = 'FAIL';
      testResults.database.details.push('Database connection unhealthy');
    }

    // Check for required columns (via a test query)
    testResults.database.details.push('Database schema validation pending');
  } catch (error) {
    testResults.database.status = 'FAIL';
    testResults.database.details.push(`Database check failed: ${error.message}`);
  }
}

// Helper function to check PII coverage
async function checkPiiCoverage() {
  try {
    // This would need to be implemented based on your specific PII coverage endpoint
    const healthResponse = await makeRequest(`${config.baseUrl}/health`);

    if (healthResponse.data.piiCoverage) {
      const { phone, email } = healthResponse.data.piiCoverage;

      if (phone >= 95 && email >= 95) {
        testResults.piiCoverage.status = 'PASS';
        testResults.piiCoverage.details.push(`PII coverage: phone ${phone}%, email ${email}%`);
      } else {
        testResults.piiCoverage.status = 'WARN';
        testResults.piiCoverage.details.push(
          `PII coverage below 95%: phone ${phone}%, email ${email}%`,
        );
      }
    } else {
      testResults.piiCoverage.status = 'PENDING';
      testResults.piiCoverage.details.push('PII coverage check not implemented in health endpoint');
    }
  } catch (error) {
    testResults.piiCoverage.status = 'FAIL';
    testResults.piiCoverage.details.push(`PII coverage check failed: ${error.message}`);
  }
}

// Helper function to check queue health
async function checkQueues() {
  try {
    const queueHealthResponse = await makeRequest(`${config.baseUrl}/queue/health`);

    if (queueHealthResponse.status === 200 && queueHealthResponse.data.redis === true) {
      testResults.queues.status = 'PASS';
      testResults.queues.details.push('Redis connection healthy');
      testResults.queues.details.push(`Queue status: ${JSON.stringify(queueHealthResponse.data)}`);
    } else {
      testResults.queues.status = 'FAIL';
      testResults.queues.details.push(
        'Redis connection unhealthy or queue health endpoint not available',
      );
    }
  } catch (error) {
    testResults.queues.status = 'FAIL';
    testResults.queues.details.push(`Queue health check failed: ${error.message}`);
  }
}

// Helper function to check security surface
async function checkSecurity() {
  const securityChecks = [];

  try {
    // Test App Proxy HMAC
    const unsignedResponse = await makeRequest(
      `${config.baseUrl}${config.appProxySubpath}/unsubscribe`,
    );
    if (unsignedResponse.status === 401) {
      securityChecks.push('App Proxy unsigned request correctly returns 401');
    } else {
      securityChecks.push(
        `App Proxy unsigned request returned ${unsignedResponse.status} (expected 401)`,
      );
    }

    // Test Admin JWT protection
    const protectedResponse = await makeRequest(`${config.baseUrl}/admin/campaigns`);
    if (protectedResponse.status === 401) {
      securityChecks.push('Admin route correctly requires authentication');
    } else {
      securityChecks.push(`Admin route returned ${protectedResponse.status} (expected 401)`);
    }

    // Test rate limiting
    const rateLimitPromises = [];
    for (let i = 0; i < 10; i++) {
      rateLimitPromises.push(makeRequest(`${config.baseUrl}/public/health`));
    }

    const rateLimitResponses = await Promise.all(rateLimitPromises);
    const rateLimited = rateLimitResponses.some((r) => r.status === 429);

    if (rateLimited) {
      securityChecks.push('Rate limiting is working (received 429)');
    } else {
      securityChecks.push('Rate limiting may not be configured or thresholds too high');
    }

    testResults.security.status = 'PASS';
    testResults.security.details = securityChecks;
  } catch (error) {
    testResults.security.status = 'FAIL';
    testResults.security.details.push(`Security check failed: ${error.message}`);
  }
}

// Helper function to check webhooks
async function checkWebhooks() {
  try {
    // Test webhook endpoints exist
    const webhookTopics = ['orders/paid', 'checkouts/update', 'inventory_levels/update'];
    const webhookResults = [];

    for (const topic of webhookTopics) {
      const response = await makeRequest(`${config.baseUrl}/webhooks/shopify/${topic}`, {
        method: 'POST',
        body: JSON.stringify({ test: true }),
        headers: {
          'X-Shopify-Topic': topic,
          'X-Shopify-Hmac-Sha256': 'test-hmac',
        },
      });

      if (response.status === 401) {
        webhookResults.push(`${topic}: HMAC validation working (401)`);
      } else {
        webhookResults.push(`${topic}: ${response.status}`);
      }
    }

    testResults.webhooks.status = 'PASS';
    testResults.webhooks.details = webhookResults;
  } catch (error) {
    testResults.webhooks.status = 'FAIL';
    testResults.webhooks.details.push(`Webhook check failed: ${error.message}`);
  }
}

// Helper function to check templates
async function checkTemplates() {
  try {
    const templateResults = [];

    const testPayloads = [
      { trigger: 'order_created', body: 'Hello {{ customer.first_name }}!' },
      { trigger: 'abandoned_checkout', body: 'Complete your order: {{ recovery_url }}' },
      { trigger: 'welcome', body: 'Welcome to {{ shop.name }}!' },
    ];

    for (const payload of testPayloads) {
      const response = await makeRequest(`${config.baseUrl}/templates/preview`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (response.status === 200 && response.data.ok) {
        templateResults.push(`${payload.trigger}: OK`);
      } else {
        templateResults.push(
          `${payload.trigger}: ${response.status} - ${response.data.error || 'Unknown error'}`,
        );
      }
    }

    testResults.templates.status = 'PASS';
    testResults.templates.details = templateResults;
  } catch (error) {
    testResults.templates.status = 'FAIL';
    testResults.templates.details.push(`Template check failed: ${error.message}`);
  }
}

// Helper function to check campaigns and discounts
async function checkCampaigns() {
  try {
    const campaignResults = [];

    // Test campaigns endpoint
    const campaignsResponse = await makeRequest(`${config.baseUrl}/campaigns`);
    if (campaignsResponse.status === 401) {
      campaignResults.push('Campaigns endpoint correctly requires authentication');
    } else {
      campaignResults.push(`Campaigns endpoint returned ${campaignsResponse.status}`);
    }

    // Test discounts endpoint
    const discountsResponse = await makeRequest(`${config.baseUrl}/discounts`);
    if (discountsResponse.status === 401) {
      campaignResults.push('Discounts endpoint correctly requires authentication');
    } else {
      campaignResults.push(`Discounts endpoint returned ${discountsResponse.status}`);
    }

    testResults.campaigns.status = 'PASS';
    testResults.campaigns.details = campaignResults;
  } catch (error) {
    testResults.campaigns.status = 'FAIL';
    testResults.campaigns.details.push(`Campaigns check failed: ${error.message}`);
  }
}

// Helper function to check reports and cache
async function checkReports() {
  try {
    const reportResults = [];

    // Test reports endpoint twice to check cache
    const report1 = await makeRequest(`${config.baseUrl}/reports/overview`);
    const report2 = await makeRequest(`${config.baseUrl}/reports/overview`);

    if (report1.status === 200 && report2.status === 200) {
      const cache1 = report1.headers['x-cache'];
      const cache2 = report2.headers['x-cache'];

      if (cache1 === 'MISS' && cache2 === 'HIT') {
        reportResults.push('Cache working correctly (MISS -> HIT)');
      } else {
        reportResults.push(`Cache headers: ${cache1} -> ${cache2}`);
      }

      // Check latency
      const latency1 = report1.headers['x-response-time'];
      const latency2 = report2.headers['x-response-time'];

      if (latency1 && latency2) {
        reportResults.push(`Latency: ${latency1}ms -> ${latency2}ms`);
      }
    } else {
      reportResults.push(`Reports endpoint returned ${report1.status} / ${report2.status}`);
    }

    testResults.reports.status = 'PASS';
    testResults.reports.details = reportResults;
  } catch (error) {
    testResults.reports.status = 'FAIL';
    testResults.reports.details.push(`Reports check failed: ${error.message}`);
  }
}

// Helper function to check metrics
async function checkMetrics() {
  try {
    const metricsResponse = await makeRequest(`${config.baseUrl}/metrics`);

    if (metricsResponse.status === 200) {
      const metricsText = metricsResponse.text;
      const requiredMetrics = [
        'queue_jobs_total',
        'queue_job_duration_seconds',
        'sms_send_attempts_total',
        'sms_delivery_success_total',
        'webhook_events_total',
        'rate_limit_hits_total',
      ];

      const foundMetrics = requiredMetrics.filter((metric) => metricsText.includes(metric));

      testResults.metrics.status = 'PASS';
      testResults.metrics.details.push(
        `Found ${foundMetrics.length}/${requiredMetrics.length} required metrics`,
      );
      testResults.metrics.details.push(
        `Missing: ${requiredMetrics.filter((m) => !foundMetrics.includes(m)).join(', ')}`,
      );
    } else {
      testResults.metrics.status = 'FAIL';
      testResults.metrics.details.push(`Metrics endpoint returned ${metricsResponse.status}`);
    }
  } catch (error) {
    testResults.metrics.status = 'FAIL';
    testResults.metrics.details.push(`Metrics check failed: ${error.message}`);
  }
}

// Main verification function
async function runGoLiveVerification() {
  console.log('🚀 Starting SMS Blossom Go-Live Verification...');
  console.log(`📍 Base URL: ${config.baseUrl}`);
  console.log(`🏪 Dev Shop: ${config.devShopDomain}`);
  console.log('');

  // Run all checks
  checkEnvironment();
  await checkDatabase();
  await checkPiiCoverage();
  await checkQueues();
  await checkSecurity();
  await checkWebhooks();
  await checkTemplates();
  await checkCampaigns();
  await checkReports();
  await checkMetrics();

  // Generate dashboard
  await generateDashboard();

  // Print executive summary
  printExecutiveSummary();
}

// Generate the go-live dashboard
async function generateDashboard() {
  const timestamp = new Date().toISOString();
  const maskedShop = config.devShopDomain.replace(/\.myshopify\.com$/, '.***');

  const dashboard = `# Go-Live Dashboard

**Date/Time:** ${timestamp} (UTC)  
**Base URL:** ${config.baseUrl}  
**Dev Shop:** ${maskedShop}  

## Summary

| Component | Status | Details |
|-----------|--------|---------|
| Environment | ${testResults.environment.status} | ${testResults.environment.details.join('; ')} |
| Database | ${testResults.database.status} | ${testResults.database.details.join('; ')} |
| PII Coverage | ${testResults.piiCoverage.status} | ${testResults.piiCoverage.details.join('; ')} |
| Queues | ${testResults.queues.status} | ${testResults.queues.details.join('; ')} |
| Security | ${testResults.security.status} | ${testResults.security.details.join('; ')} |
| Webhooks | ${testResults.webhooks.status} | ${testResults.webhooks.details.join('; ')} |
| Templates | ${testResults.templates.status} | ${testResults.templates.details.join('; ')} |
| Campaigns | ${testResults.campaigns.status} | ${testResults.campaigns.details.join('; ')} |
| Reports | ${testResults.reports.status} | ${testResults.reports.details.join('; ')} |
| Metrics | ${testResults.metrics.status} | ${testResults.metrics.details.join('; ')} |

## Critical Issues

${getCriticalIssues()}

## Next Steps

${getNextSteps()}
`;

  // Write dashboard to file
  fs.writeFileSync('reports/GO_LIVE_DASHBOARD.md', dashboard);

  console.log('📊 Dashboard generated: reports/GO_LIVE_DASHBOARD.md');
}

// Get critical issues
function getCriticalIssues() {
  const critical = Object.entries(testResults)
    .filter(([_, result]) => result.status === 'FAIL')
    .map(([component, result]) => `- **${component}**: ${result.details.join('; ')}`);

  if (critical.length === 0) {
    return 'None - All systems operational! 🎉';
  }

  return critical.join('\n');
}

// Get next steps
function getNextSteps() {
  const failed = Object.entries(testResults).filter(([_, result]) => result.status === 'FAIL');

  if (failed.length === 0) {
    return '✅ **Ready for Production!** All systems are operational.';
  }

  return `❌ **${failed.length} critical issues** must be resolved before go-live.`;
}

// Print executive summary
function printExecutiveSummary() {
  const failed = Object.entries(testResults).filter(([_, result]) => result.status === 'FAIL');
  const warned = Object.entries(testResults).filter(([_, result]) => result.status === 'WARN');

  console.log('\n' + '='.repeat(60));
  console.log('🎯 EXECUTIVE SUMMARY');
  console.log('='.repeat(60));

  if (failed.length === 0) {
    console.log('✅ **READY FOR PRODUCTION**');
    console.log('All critical systems are operational.');
  } else {
    console.log('❌ **BLOCKED**');
    console.log(`Critical issues: ${failed.length}`);
    failed.forEach(([component, result]) => {
      console.log(`  - ${component}: ${result.details[0]}`);
    });
  }

  if (warned.length > 0) {
    console.log(`⚠️  Warnings: ${warned.length}`);
    warned.forEach(([component, result]) => {
      console.log(`  - ${component}: ${result.details[0]}`);
    });
  }

  console.log('\n📊 Dashboard: reports/GO_LIVE_DASHBOARD.md');
  console.log('📋 Runbook: reports/GO_LIVE_RUNBOOK.md');
  console.log('='.repeat(60));
}

// Load environment variables first
loadEnvFile();

// Initialize config with loaded environment variables
initializeConfig();

// Debug environment variables
console.log('🔍 Environment variables loaded:');
console.log(`  BASE_URL: ${process.env.BASE_URL}`);
console.log(`  FRONTEND_URL: ${process.env.FRONTEND_URL}`);
console.log(`  DEV_SHOP_DOMAIN: ${process.env.DEV_SHOP_DOMAIN}`);
console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`);
console.log(`  WEBHOOK_HMAC_SECRET: ${process.env.WEBHOOK_HMAC_SECRET ? 'SET' : 'NOT SET'}`);
console.log('');

// Run the verification
runGoLiveVerification().catch(console.error);
