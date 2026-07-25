const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

const checks = [
  { name: "landing page", path: "/", status: 200, contains: "Textback" },
  { name: "public health", path: "/api/health", status: 200, json: (body) => body.service === "textback" && body.status === "ok" },
  { name: "admin login", path: "/admin/login", status: 200, contains: "Logga" },
  { name: "customer login", path: "/portal/login", status: 200, contains: "Logga" },
  { name: "unauthorized call webhook", path: "/api/telephony/46elks/incoming", method: "POST", status: 401 },
  { name: "unauthorized inbound SMS webhook", path: "/api/telephony/46elks/incoming-sms", method: "POST", status: 401 },
  { name: "invalid Stripe webhook", path: "/api/stripe/webhook", method: "POST", status: 400 },
];

let failures = 0;
for (const check of checks) {
  try {
    const response = await fetch(`${base}${check.path}`, {
      method: check.method || "GET",
      redirect: "manual",
      headers: check.method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
      body: check.method === "POST" ? "" : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    let ok = response.status === check.status;
    if (ok && check.contains) ok = text.includes(check.contains);
    if (ok && check.json) {
      try { ok = Boolean(check.json(JSON.parse(text))); } catch { ok = false; }
    }
    if (!ok) {
      failures++;
      console.error(`FAIL ${check.name}: expected ${check.status}, received ${response.status}`);
    } else {
      console.log(`PASS ${check.name}`);
    }
  } catch (error) {
    failures++;
    console.error(`FAIL ${check.name}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

if (failures) {
  console.error(`Smoke tests failed: ${failures}`);
  process.exit(1);
}
console.log(`Smoke tests passed: ${checks.length}`);
