// Run: k6 run --env K6_AUTH_TOKEN=<jwt> --env K6_BASE_URL=http://localhost:3000 k6/load-test.js

import http from "k6/http";
import { sleep, check } from "k6";
import { Rate } from "k6/metrics";

const errorRate = new Rate("errors");

const BASE_URL = __ENV.K6_BASE_URL || "http://localhost:3000";
const AUTH_TOKEN = __ENV.K6_AUTH_TOKEN || "";

export const options = {
  stages: [
    { duration: "30s", target: 10 },  // ramp up to 10 VUs
    { duration: "60s", target: 10 },  // hold 10 VUs
    { duration: "30s", target: 50 },  // ramp up to 50 VUs
    { duration: "120s", target: 50 }, // hold 50 VUs
    { duration: "30s", target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000"],
    errors: ["rate<0.01"],
  },
};

// Weighted endpoint distribution — cumulative weights sum to 100
const ENDPOINTS = [
  { path: "/api/v1/analytics/age-distribution",          weight: 10 },
  { path: "/api/v1/analytics/joining-data",              weight: 10 },
  { path: "/api/v1/analytics/tenure-distribution",       weight: 10 },
  { path: "/api/v1/analytics/headcount-growth",          weight: 10 },
  { path: "/api/v1/analytics/attendance-trends",         weight: 15 },
  { path: "/api/v1/analytics/working-hours-distribution",weight: 15 },
  { path: "/api/v1/analytics/monthly-leave-patterns",    weight: 10 },
  { path: "/api/v1/analytics/employee-departments",      weight: 10 },
  { path: "/api/v1/analytics/hiring-funnel",             weight: 10 },
];

// Build a cumulative weight array for O(n) weighted random selection
const CUMULATIVE = (() => {
  const out = [];
  let acc = 0;
  for (const ep of ENDPOINTS) {
    acc += ep.weight;
    out.push({ path: ep.path, cumulative: acc });
  }
  return out;
})();
const TOTAL_WEIGHT = CUMULATIVE[CUMULATIVE.length - 1].cumulative;

function randomWeightedEndpoint() {
  const rand = Math.random() * TOTAL_WEIGHT;
  for (const entry of CUMULATIVE) {
    if (rand < entry.cumulative) {
      return entry.path;
    }
  }
  // Fallback — should never reach here
  return ENDPOINTS[ENDPOINTS.length - 1].path;
}

const HEADERS = {
  Authorization: `Bearer ${AUTH_TOKEN}`,
  "Content-Type": "application/json",
};

export default function () {
  const path = randomWeightedEndpoint();
  const url = `${BASE_URL}${path}`;

  const res = http.get(url, { headers: HEADERS });

  const ok = check(res, {
    "status is 200": (r) => r.status === 200,
    "response time < 2s": (r) => r.timings.duration < 2000,
  });

  errorRate.add(!ok);

  sleep(1);
}
