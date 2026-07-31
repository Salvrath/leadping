import { NextResponse } from "next/server";
import { isLikelyLinkScanner, isValidSalesShortCode } from "@/lib/sales-click-tracking";
import { siteUrl } from "@/lib/site";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { code: string } }) {
  const code = params.code;
  if (!isValidSalesShortCode(code)) return NextResponse.redirect(`${siteUrl}/`);

  const secFetchUser = request.headers.get("sec-fetch-user");
  const userNavigation = secFetchUser === "?1";
  const db = getSupabaseAdmin();
  const { data: lead, error } = await db.from("sales_leads")
    .select("id,tracking_token")
    .eq("short_code", code)
    .maybeSingle();
  if (error || !lead) return NextResponse.redirect(`${siteUrl}/`);

  const userAgent = request.headers.get("user-agent");
  const secFetchDest = request.headers.get("sec-fetch-dest");
  await db.from("sales_tracking_events").insert({
    sales_lead_id: lead.id,
    event_type: "request",
    user_agent: userAgent?.slice(0, 500) || null,
    suspected_scanner: isLikelyLinkScanner({ userAgent, secFetchDest }),
    request_metadata: {
      channel: "sms",
      link_format: "short_code",
      short_code: code,
      user_navigation: userNavigation,
      sec_fetch_user: secFetchUser,
      sec_fetch_site: request.headers.get("sec-fetch-site"),
      sec_fetch_mode: request.headers.get("sec-fetch-mode"),
      sec_fetch_dest: secFetchDest,
      accept: request.headers.get("accept")?.slice(0, 500) || null,
    },
  });

  const html = `<!doctype html>
<html lang="sv" data-sales-token="${lead.tracking_token}" data-user-navigation="${userNavigation}" data-email-recipient-token="">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Öppnar Textback</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f4ee;color:#10243e;font-family:Arial,sans-serif}.card{width:min(92vw,430px);padding:38px 30px;text-align:center;background:#fff;border:1px solid #dde5e7;border-radius:20px;box-shadow:0 20px 60px rgba(16,36,62,.12)}img{width:180px;height:auto}.loader{width:34px;height:34px;margin:26px auto 18px;border:3px solid #d7e4e7;border-top-color:#176b87;border-radius:50%;animation:spin .8s linear infinite}p{margin:0;color:#526277;line-height:1.5}a{display:inline-block;margin-top:18px;color:#176b87;font-weight:700}@keyframes spin{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <main class="card">
    <img src="/textback-logo.svg" alt="Textback">
    <div class="loader" aria-hidden="true"></div>
    <p>Öppnar Textback…</p>
    <a href="/#ansok">Fortsätt till hemsidan</a>
  </main>
  <script src="/sales-click-confirm.js" defer></script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
