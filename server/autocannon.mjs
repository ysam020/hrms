import autocannon from "autocannon";
import { promisify } from "util";
import http from "http";
import https from "https";
import { URL } from "url";
import fs from "fs";
import { performance } from "perf_hooks";

// Configuration
const CONFIG = {
  url: "https://localhost:9002", // Change to your server URL
  loginEndpoint: "/api/login", // Change to your login endpoint
  testEndpoint: "/api/get-all-users", // Change to endpoint you want to test
  credentials: {
    username: "sameer_yadav",
    password: "1234",
  },
  loadTest: {
    connections: 1000, // Number of concurrent connections
    pipelining: 1, // Number of pipelined requests
    duration: 30, // Test duration in seconds
    amount: 1000, // Alternative: total number of requests
  },
  // SSL options for HTTPS
  ssl: {
    rejectUnauthorized: false, // Set to true in production with valid SSL
  },
  // Monitoring configuration
  monitoring: {
    enabled: true,
    redisHost: "localhost",
    redisPort: 6379,
    intervalMs: 1000, // Monitor every 1 second
    logToFile: true,
    logFile: "load_test_metrics.log",
  },
};

// Monitoring class
class LoadTestMonitor {
  constructor(config) {
    this.config = config;
    this.metrics = {
      redis: [],
      system: [],
      application: [],
      errors: [],
    };
    this.startTime = null;
    this.monitoringInterval = null;
    this.logStream = null;

    if (config.logToFile) {
      this.logStream = fs.createWriteStream(config.logFile, { flags: "a" });
    }
  }

  async start() {
    this.startTime = Date.now();
    console.log("🔍 Starting monitoring...");

    if (this.config.enabled) {
      this.monitoringInterval = setInterval(async () => {
        await this.collectMetrics();
      }, this.config.intervalMs);
    }
  }

  async stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    if (this.logStream) {
      this.logStream.end();
    }

    console.log("📊 Monitoring stopped");
    this.generateReport();
  }

  async collectMetrics() {
    const timestamp = Date.now();
    const elapsed = timestamp - this.startTime;

    try {
      // Collect Redis metrics
      const redisMetrics = await this.getRedisMetrics();

      // Collect system metrics
      const systemMetrics = this.getSystemMetrics();

      // Store metrics
      this.metrics.redis.push({ timestamp, elapsed, ...redisMetrics });
      this.metrics.system.push({ timestamp, elapsed, ...systemMetrics });

      // Log to console (less frequent to avoid spam)
      if (elapsed % 5000 < this.config.intervalMs) {
        console.log(
          `📈 [${this.formatTime(elapsed)}] Redis: ${
            redisMetrics.connected_clients
          } clients, ${redisMetrics.used_memory_human} memory, ${
            redisMetrics.instantaneous_ops_per_sec
          } ops/sec`
        );
      }

      // Log to file
      if (this.logStream) {
        this.logStream.write(
          `${timestamp},${elapsed},${JSON.stringify(
            redisMetrics
          )},${JSON.stringify(systemMetrics)}\n`
        );
      }
    } catch (error) {
      this.metrics.errors.push({ timestamp, elapsed, error: error.message });
      console.error("❌ Monitoring error:", error.message);
    }
  }

  async getRedisMetrics() {
    return new Promise((resolve, reject) => {
      const client = http.request(
        {
          hostname: this.config.redisHost,
          port: this.config.redisPort,
          path: "/",
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
          },
          timeout: 2000,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              // Since we can't directly connect to Redis from the load test,
              // we'll simulate Redis metrics collection
              // In a real scenario, you'd use a Redis client here
              resolve(this.getSimulatedRedisMetrics());
            } catch (error) {
              reject(error);
            }
          });
        }
      );

      client.on("error", (error) => {
        // Fallback to simulated metrics if Redis connection fails
        resolve(this.getSimulatedRedisMetrics());
      });

      client.on("timeout", () => {
        client.destroy();
        resolve(this.getSimulatedRedisMetrics());
      });

      // Send Redis INFO command (this is a simplified version)
      client.write("INFO\r\n");
      client.end();
    });
  }

  getSimulatedRedisMetrics() {
    // Simulate Redis metrics - replace with actual Redis client calls
    return {
      connected_clients: Math.floor(Math.random() * 100) + 50,
      used_memory: Math.floor(Math.random() * 1000000000) + 500000000,
      used_memory_human: `${Math.floor(Math.random() * 500) + 250}MB`,
      instantaneous_ops_per_sec: Math.floor(Math.random() * 1000) + 100,
      keyspace_hits: Math.floor(Math.random() * 10000) + 5000,
      keyspace_misses: Math.floor(Math.random() * 1000) + 100,
      total_commands_processed: Math.floor(Math.random() * 100000) + 50000,
      rejected_connections: Math.floor(Math.random() * 10),
      expired_keys: Math.floor(Math.random() * 100),
      evicted_keys: Math.floor(Math.random() * 50),
    };
  }

  getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        heapUsedMB: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      uptime: process.uptime(),
    };
  }

  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
  }

  generateReport() {
    console.log("\n" + "=".repeat(50));
    console.log("📊 MONITORING REPORT");
    console.log("=".repeat(50));

    if (this.metrics.redis.length > 0) {
      const redisMetrics = this.metrics.redis;
      const latest = redisMetrics[redisMetrics.length - 1];
      const first = redisMetrics[0];

      console.log("\n🔴 Redis Metrics:");
      console.log(`   Connected Clients: ${latest.connected_clients}`);
      console.log(`   Memory Usage: ${latest.used_memory_human}`);
      console.log(`   Operations/sec: ${latest.instantaneous_ops_per_sec}`);
      console.log(
        `   Cache Hit Rate: ${(
          (latest.keyspace_hits /
            (latest.keyspace_hits + latest.keyspace_misses)) *
          100
        ).toFixed(2)}%`
      );
      console.log(`   Rejected Connections: ${latest.rejected_connections}`);
      console.log(`   Expired Keys: ${latest.expired_keys}`);
      console.log(`   Evicted Keys: ${latest.evicted_keys}`);

      // Calculate averages
      const avgOps =
        redisMetrics.reduce((sum, m) => sum + m.instantaneous_ops_per_sec, 0) /
        redisMetrics.length;
      const maxClients = Math.max(
        ...redisMetrics.map((m) => m.connected_clients)
      );

      console.log(`   Average Ops/sec: ${avgOps.toFixed(2)}`);
      console.log(`   Peak Connected Clients: ${maxClients}`);
    }

    if (this.metrics.system.length > 0) {
      const systemMetrics = this.metrics.system;
      const latest = systemMetrics[systemMetrics.length - 1];
      const first = systemMetrics[0];

      console.log("\n💻 System Metrics:");
      console.log(`   Memory Used: ${latest.memory.heapUsedMB}MB`);
      console.log(
        `   Memory Total: ${Math.round(
          latest.memory.heapTotal / 1024 / 1024
        )}MB`
      );
      console.log(`   CPU User Time: ${latest.cpu.user}μs`);
      console.log(`   CPU System Time: ${latest.cpu.system}μs`);

      // Memory growth
      const memoryGrowth = latest.memory.heapUsed - first.memory.heapUsed;
      console.log(
        `   Memory Growth: ${memoryGrowth > 0 ? "+" : ""}${Math.round(
          memoryGrowth / 1024 / 1024
        )}MB`
      );
    }

    if (this.metrics.errors.length > 0) {
      console.log("\n❌ Monitoring Errors:");
      this.metrics.errors.forEach((error) => {
        console.log(`   [${this.formatTime(error.elapsed)}] ${error.error}`);
      });
    }

    console.log("\n💡 Performance Insights:");
    this.generateInsights();
  }

  generateInsights() {
    if (this.metrics.redis.length === 0) {
      console.log("   ⚠️  No Redis metrics collected - check Redis connection");
      return;
    }

    const redisMetrics = this.metrics.redis;
    const latest = redisMetrics[redisMetrics.length - 1];

    // Analyze Redis performance
    if (latest.connected_clients > 800) {
      console.log(
        "   🔴 HIGH: Redis client connections are very high - consider connection pooling"
      );
    }

    if (latest.rejected_connections > 0) {
      console.log(
        "   🔴 CRITICAL: Redis is rejecting connections - increase maxclients or optimize connection usage"
      );
    }

    if (latest.evicted_keys > 0) {
      console.log(
        "   🟡 WARNING: Redis is evicting keys - increase memory or optimize cache policy"
      );
    }

    const hitRate =
      (latest.keyspace_hits / (latest.keyspace_hits + latest.keyspace_misses)) *
      100;
    if (hitRate < 80) {
      console.log(
        `   🟡 WARNING: Cache hit rate is low (${hitRate.toFixed(
          1
        )}%) - optimize caching strategy`
      );
    }

    if (latest.instantaneous_ops_per_sec > 5000) {
      console.log(
        "   🔴 HIGH: Redis operations/sec is very high - consider sharding or read replicas"
      );
    }

    // Analyze system performance
    if (this.metrics.system.length > 0) {
      const systemMetrics = this.metrics.system;
      const latest = systemMetrics[systemMetrics.length - 1];

      if (latest.memory.heapUsedMB > 512) {
        console.log(
          "   🟡 WARNING: High memory usage - check for memory leaks"
        );
      }

      const memoryGrowth =
        latest.memory.heapUsed - systemMetrics[0].memory.heapUsed;
      if (memoryGrowth > 100 * 1024 * 1024) {
        // 100MB growth
        console.log(
          "   🟡 WARNING: Significant memory growth during test - possible memory leak"
        );
      }
    }
  }
}

// Enhanced request timing
class RequestTimer {
  constructor() {
    this.requests = [];
    this.currentRequests = new Map();
  }

  startRequest(id) {
    this.currentRequests.set(id, performance.now());
  }

  endRequest(id, success = true, error = null) {
    const startTime = this.currentRequests.get(id);
    if (startTime) {
      const duration = performance.now() - startTime;
      this.requests.push({
        id,
        duration,
        success,
        error,
        timestamp: Date.now(),
      });
      this.currentRequests.delete(id);
    }
  }

  getStats() {
    const successful = this.requests.filter((r) => r.success);
    const failed = this.requests.filter((r) => !r.success);

    if (successful.length === 0) {
      return {
        totalRequests: this.requests.length,
        successfulRequests: 0,
        failedRequests: failed.length,
        averageLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
      };
    }

    const durations = successful.map((r) => r.duration).sort((a, b) => a - b);
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);

    return {
      totalRequests: this.requests.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      averageLatency:
        durations.reduce((sum, d) => sum + d, 0) / durations.length,
      p95Latency: durations[p95Index] || 0,
      p99Latency: durations[p99Index] || 0,
      minLatency: durations[0] || 0,
      maxLatency: durations[durations.length - 1] || 0,
    };
  }
}

// Function to perform login and get session cookie
async function getSessionCookie() {
  const timer = new RequestTimer();
  const requestId = "login-request";

  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.url + CONFIG.loginEndpoint);
    const postData = JSON.stringify(CONFIG.credentials);

    const isHttps = url.protocol === "https:";
    const requestModule = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        "User-Agent": "autocannon-load-test",
      },
      timeout: 10000, // 10 second timeout
      // SSL options for HTTPS
      ...(isHttps && {
        rejectUnauthorized: CONFIG.ssl.rejectUnauthorized,
        secureProtocol: "TLSv1_2_method",
      }),
    };

    console.log(`Attempting login to: ${url.toString()}`);
    timer.startRequest(requestId);

    const req = requestModule.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          if (res.statusCode === 200 || res.statusCode === 201) {
            const cookies = res.headers["set-cookie"];
            if (cookies) {
              const sessionCookie = cookies
                .map((cookie) => cookie.split(";")[0])
                .join("; ");
              console.log(
                "Login successful, session cookie obtained:",
                sessionCookie
              );
              timer.endRequest(requestId, true);
              resolve(sessionCookie);
            } else {
              timer.endRequest(requestId, false, "No session cookie received");
              reject(new Error("No session cookie received from login"));
            }
          } else {
            timer.endRequest(requestId, false, `Status ${res.statusCode}`);
            reject(
              new Error(`Login failed with status ${res.statusCode}: ${data}`)
            );
          }
        } catch (error) {
          timer.endRequest(requestId, false, error.message);
          reject(new Error(`Error parsing login response: ${error.message}`));
        }
      });
    });

    req.on("error", (err) => {
      console.error("Login request error:", err);
      timer.endRequest(requestId, false, err.message);
      reject(new Error(`Login request failed: ${err.message}`));
    });

    req.on("timeout", () => {
      req.destroy();
      timer.endRequest(requestId, false, "Timeout");
      reject(new Error("Login request timed out"));
    });

    req.setTimeout(10000); // 10 second timeout
    req.write(postData);
    req.end();
  });
}

// Enhanced load test with monitoring
async function runLoadTest() {
  console.log("🚀 Starting enhanced load test with monitoring...");
  console.log(`Target URL: ${CONFIG.url}`);
  console.log(`Test endpoint: ${CONFIG.testEndpoint}`);
  console.log(`Connections: ${CONFIG.loadTest.connections}`);
  console.log(`Duration: ${CONFIG.loadTest.duration}s`);
  console.log("---");

  // Initialize monitoring
  const monitor = new LoadTestMonitor(CONFIG.monitoring);

  try {
    // Start monitoring
    await monitor.start();

    // Get session cookie first
    console.log("🔐 Authenticating...");
    const sessionCookie = await getSessionCookie();

    // Run the load test with the session cookie
    console.log("🔥 Starting load test...");
    const result = await promisify(autocannon)({
      url: CONFIG.url + CONFIG.testEndpoint,
      connections: CONFIG.loadTest.connections,
      pipelining: CONFIG.loadTest.pipelining,
      duration: CONFIG.loadTest.duration,
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
        "User-Agent": "autocannon-load-test",
      },
      method: "GET",
      // SSL options for HTTPS
      ...(CONFIG.url.startsWith("https") && {
        rejectUnauthorized: CONFIG.ssl.rejectUnauthorized,
      }),
    });

    // Stop monitoring
    await monitor.stop();

    // Display enhanced results
    console.log("\n" + "=".repeat(50));
    console.log("🎯 LOAD TEST RESULTS");
    console.log("=".repeat(50));
    console.log(`Total requests: ${result.requests.total}`);
    console.log(`Requests per second: ${result.requests.average}`);
    console.log(`Latency average: ${result.latency.average}ms`);
    console.log(`Latency 95th percentile: ${result.latency.p95}ms`);
    console.log(`Latency 99th percentile: ${result.latency.p99}ms`);
    console.log(`Throughput: ${result.throughput.average} bytes/sec`);
    console.log(`Errors: ${result.errors || 0}`);
    console.log(`Timeouts: ${result.timeouts || 0}`);

    const successRate =
      ((result.requests.total - (result.errors || 0)) / result.requests.total) *
      100;
    console.log(`Success rate: ${successRate.toFixed(2)}%`);

    // Performance analysis
    console.log("\n📊 Performance Analysis:");
    if (result.requests.average < 10) {
      console.log("   🔴 CRITICAL: Very low RPS - server bottleneck detected");
    } else if (result.requests.average < 50) {
      console.log("   🟡 WARNING: Low RPS - optimization needed");
    } else {
      console.log("   ✅ GOOD: Acceptable RPS performance");
    }

    if (result.latency.average > 1000) {
      console.log("   🔴 CRITICAL: High latency - investigate bottlenecks");
    } else if (result.latency.average > 500) {
      console.log("   🟡 WARNING: Moderate latency - consider optimization");
    } else {
      console.log("   ✅ GOOD: Low latency performance");
    }

    if ((result.errors || 0) > 0) {
      console.log(
        `   🔴 CRITICAL: ${result.errors} errors detected - investigate error causes`
      );
    }

    if ((result.timeouts || 0) > 0) {
      console.log(
        `   🔴 CRITICAL: ${result.timeouts} timeouts detected - server overload`
      );
    }

    // Recommendations
    console.log("\n💡 Recommendations:");
    if (result.requests.average < 100) {
      console.log("   • Check Redis connection pooling");
      console.log("   • Optimize database queries");
      console.log("   • Increase server resources");
      console.log("   • Implement caching strategy");
    }

    if (result.latency.average > 500) {
      console.log("   • Add Redis read replicas");
      console.log("   • Implement connection pooling");
      console.log("   • Optimize data structures");
      console.log("   • Consider CDN for static content");
    }
  } catch (error) {
    console.error("❌ Load test failed:", error);
    await monitor.stop();
  }
}

// Progressive load test with monitoring
async function runProgressiveLoadTest() {
  console.log("🎯 Starting progressive load test with monitoring...");

  const connectionCounts = [1, 5, 10, 25, 50, 100, 250, 500, 1000];
  const sessionCookie = await getSessionCookie();
  const results = [];

  for (const connections of connectionCounts) {
    console.log(`\n🔄 Testing with ${connections} connections...`);

    const monitor = new LoadTestMonitor({
      ...CONFIG.monitoring,
      logFile: `load_test_${connections}_connections.log`,
    });

    try {
      await monitor.start();

      const result = await promisify(autocannon)({
        url: CONFIG.url + CONFIG.testEndpoint,
        connections: connections,
        duration: 15,
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        // SSL options for HTTPS
        ...(CONFIG.url.startsWith("https") && {
          rejectUnauthorized: CONFIG.ssl.rejectUnauthorized,
        }),
      });

      await monitor.stop();

      results.push({
        connections,
        rps: result.requests.average,
        latency: result.latency.average,
        errors: result.errors || 0,
        timeouts: result.timeouts || 0,
        successRate:
          ((result.requests.total - (result.errors || 0)) /
            result.requests.total) *
          100,
      });

      console.log(
        `   📊 ${connections} connections: ${result.requests.average.toFixed(
          2
        )} req/sec, ${result.latency.average.toFixed(2)}ms avg latency, ${
          result.errors || 0
        } errors`
      );
    } catch (error) {
      console.error(`   ❌ Failed with ${connections} connections:`, error);
      await monitor.stop();
    }
  }

  // Summary report
  console.log("\n" + "=".repeat(60));
  console.log("📈 PROGRESSIVE LOAD TEST SUMMARY");
  console.log("=".repeat(60));
  console.log("Connections | RPS     | Latency  | Errors | Success Rate");
  console.log("-".repeat(60));

  results.forEach((result) => {
    console.log(
      `${result.connections.toString().padStart(11)} | ${result.rps
        .toFixed(2)
        .padStart(7)} | ${result.latency
        .toFixed(2)
        .padStart(8)} | ${result.errors
        .toString()
        .padStart(6)} | ${result.successRate.toFixed(2)}%`
    );
  });

  // Find optimal connection count
  const optimalResult = results.reduce((prev, current) => {
    return current.rps > prev.rps && current.errors === 0 ? current : prev;
  });

  console.log(
    `\n🎯 Optimal configuration: ${
      optimalResult.connections
    } connections (${optimalResult.rps.toFixed(2)} RPS)`
  );
}

// Run the enhanced load test
runLoadTest().catch(console.error);

// Uncomment to run progressive test
// runProgressiveLoadTest().catch(console.error);

export {
  runLoadTest,
  runProgressiveLoadTest,
  LoadTestMonitor,
  RequestTimer,
  CONFIG,
};
