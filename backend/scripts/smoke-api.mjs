/**
 * API smoke test — pings each route and verifies it is NOT 404.
 *
 * Catches a specific failure mode: route file exists on disk, build manifest
 * lists it, but Next.js dev server (Turbopack) fails to compile it. The route
 * silently returns 404 instead of hitting the handler. Hard to spot manually;
 * very obvious here.
 *
 * The test does NOT check for 200. A 400/405/500 means the handler ran and
 * rejected the input — that's fine; the route is registered. A 404 means the
 * route is missing entirely.
 *
 * Usage: `node scripts/smoke-api.mjs [baseUrl]`
 * Default baseUrl: http://127.0.0.1:3017
 */

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3017";

const TEST_UUID = "00000000-0000-0000-0000-000000000000";

const endpoints = [
  { method: "GET", path: "/api/health" },
  { method: "GET", path: "/api/workspaces" },
  { method: "POST", path: "/api/admin/init-db" },
  { method: "GET", path: `/api/workspace-defaults?workspaceId=${TEST_UUID}` },
  { method: "GET", path: `/api/group-messages?groupId=${TEST_UUID}` },
  { method: "GET", path: `/api/workspaces/${TEST_UUID}/defaults` },
  { method: "GET", path: `/api/groups/${TEST_UUID}/messages` },
  // Note: agent-context-stream is SSE and hangs on GET, so we skip it here.
  // The flat route was created at the same time as the others; if it works,
  // the SSE one works too (same routing mechanism).
];

let failed = 0;
let passed = 0;

for (const { method, path } of endpoints) {
  const url = baseUrl + path;
  try {
    const res = await fetch(url, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : {},
      body: method === "POST" ? "{}" : undefined,
    });
    // Differentiate "route not registered" (Next.js 404 HTML page) from
    // "handler-returned 404" (e.g. resource not found, JSON body). The
    // smoke test only flags the former — handler responses prove the
    // route is registered regardless of status.
    const contentType = res.headers.get("content-type") ?? "";
    const isRouteMissing = res.status === 404 && !contentType.includes("application/json");
    if (isRouteMissing) {
      console.error(`FAIL ${method} ${path} → 404 (route not registered)`);
      failed++;
    } else {
      console.log(`ok   ${method} ${path} → ${res.status}`);
      passed++;
    }
  } catch (e) {
    console.error(`FAIL ${method} ${path} → fetch error: ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
