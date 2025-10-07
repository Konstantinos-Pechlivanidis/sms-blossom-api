// checks/perf-smoke.js
// Performance smoke test

import { performance } from 'perf_hooks';
import fetch from 'node-fetch';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const DURATION = 30000; // 30 seconds
const CONCURRENCY = 5;

async function runPerformanceSmokeTest() {
  console.log('🚀 Starting Performance Smoke Test...\n');
  console.log(`📊 Target: ${BASE_URL}`);
  console.log(`⏱️  Duration: ${DURATION / 1000}s`);
  console.log(`👥 Concurrency: ${CONCURRENCY}\n`);

  const results = {
    requests: 0,
    errors: 0,
    latencies: [],
    statusCodes: {},
    startTime: Date.now(),
  };

  const endpoints = ['/health', '/reports/overview', '/metrics', '/gdpr/status'];

  const startTime = performance.now();
  const endTime = startTime + DURATION;

  console.log('🔄 Running load test...');

  // Run concurrent requests
  const promises = Array(CONCURRENCY)
    .fill()
    .map(() => runWorker(endpoints, endTime, results));

  await Promise.all(promises);

  const _totalTime = performance.now() - startTime;
  const duration = Date.now() - results.startTime;

  // Calculate statistics
  const stats = calculateStats(results, duration);

  // Print results
  console.log('\n📈 PERFORMANCE RESULTS:');
  console.log('========================');
  console.log(`📊 Total Requests: ${results.requests}`);
  console.log(`❌ Errors: ${results.errors}`);
  console.log(`📈 Requests/sec: ${stats.rps.toFixed(2)}`);
  console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`📊 p50 Latency: ${stats.p50.toFixed(2)}ms`);
  console.log(`📊 p95 Latency: ${stats.p95.toFixed(2)}ms`);
  console.log(`📊 p99 Latency: ${stats.p99.toFixed(2)}ms`);
  console.log(`📊 Max Latency: ${stats.max.toFixed(2)}ms`);
  console.log(`📊 Min Latency: ${stats.min.toFixed(2)}ms`);

  console.log('\n📊 Status Code Distribution:');
  Object.entries(results.statusCodes).forEach(([code, count]) => {
    const percentage = ((count / results.requests) * 100).toFixed(1);
    console.log(`   ${code}: ${count} (${percentage}%)`);
  });

  // Performance validation
  console.log('\n✅ Performance Validation:');
  const validation = validatePerformance(stats);
  validation.forEach((result) => {
    console.log(`   ${result.pass ? '✅' : '❌'} ${result.message}`);
  });

  const allPassed = validation.every((v) => v.pass);
  console.log(`\n🎯 Overall Result: ${allPassed ? 'PASS' : 'FAIL'}`);

  return {
    stats,
    validation,
    passed: allPassed,
  };
}

async function runWorker(endpoints, endTime, results) {
  while (performance.now() < endTime) {
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const start = performance.now();

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'GET',
        timeout: 5000,
      });

      const latency = performance.now() - start;

      results.requests++;
      results.latencies.push(latency);
      results.statusCodes[response.status] = (results.statusCodes[response.status] || 0) + 1;

      if (!response.ok) {
        results.errors++;
      }
    } catch {
      const latency = performance.now() - start;
      results.requests++;
      results.latencies.push(latency);
      results.errors++;
      results.statusCodes['error'] = (results.statusCodes['error'] || 0) + 1;
    }

    // Small delay to prevent overwhelming the server
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function calculateStats(results, duration) {
  const latencies = results.latencies.sort((a, b) => a - b);
  const count = latencies.length;

  if (count === 0) {
    return {
      rps: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      max: 0,
      min: 0,
    };
  }

  const rps = results.requests / (duration / 1000);
  const p50 = latencies[Math.floor(count * 0.5)];
  const p95 = latencies[Math.floor(count * 0.95)];
  const p99 = latencies[Math.floor(count * 0.99)];
  const max = latencies[count - 1];
  const min = latencies[0];

  return { rps, p50, p95, p99, max, min };
}

function validatePerformance(stats) {
  const validation = [];

  // p50 < 200ms
  validation.push({
    pass: stats.p50 < 200,
    message: `p50 latency < 200ms (actual: ${stats.p50.toFixed(2)}ms)`,
  });

  // p95 < 800ms
  validation.push({
    pass: stats.p95 < 800,
    message: `p95 latency < 800ms (actual: ${stats.p95.toFixed(2)}ms)`,
  });

  // Error rate < 5%
  const errorRate = (stats.errors / stats.requests) * 100;
  validation.push({
    pass: errorRate < 5,
    message: `Error rate < 5% (actual: ${errorRate.toFixed(2)}%)`,
  });

  // RPS > 10
  validation.push({
    pass: stats.rps > 10,
    message: `RPS > 10 (actual: ${stats.rps.toFixed(2)})`,
  });

  return validation;
}

// Run smoke test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runPerformanceSmokeTest()
    .then((result) => {
      process.exit(result.passed ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Performance test failed:', error.message);
      process.exit(1);
    });
}

export { runPerformanceSmokeTest };
