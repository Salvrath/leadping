import { NextResponse } from "next/server";
import { isLikelyLinkScanner, isValidSalesTrackingToken } from "@/lib/sales-click-tracking";
import { siteUrl } from "@/lib/site";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  if (!isValidSalesTrackingToken(token)) return NextResponse.redirect(`${siteUrl}/`);

  const db = getSupabaseAdmin();
  const { data: lead } = await db.from("sales_leads").select("id").eq("tracking_token", token).maybeSingle();
  if (lead) {
    const userAgent = request.headers.get("user-agent");
    const secFetchDest = request.headers.get("sec-fetch-dest");
    await db.from("sales_tracking_events").insert({
      sales_lead_id: lead.id,
      event_type: "request",
      user_agent: userAgent?.slice(0, 500) || null,
      suspected_scanner: isLikelyLinkScanner({ userAgent, secFetchDest }),
      request_metadata: {
        sec_fetch_user: request.headers.get("sec-fetch-user"),
        sec_fetch_site: request.headers.get("sec-fetch-site"),
        sec_fetch_mode: request.headers.get("sec-fetch-mode"),
        sec_fetch_dest: secFetchDest,
        accept: request.headers.get("accept")?.slice(0, 500) || null,
      },
    });
  }

  const destination = new URL(siteUrl);
  destination.searchParams.set("tb", token);
  destination.hash = "ansok";
  return NextResponse.redirect(destination, 302);
}
