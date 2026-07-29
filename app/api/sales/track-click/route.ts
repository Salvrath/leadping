import { NextResponse } from "next/server";
import { z } from "zod";
import { isValidSalesTrackingToken } from "@/lib/sales-click-tracking";
import { getSupabaseAdmin } from "@/lib/server/supabase";

const payloadSchema = z.object({
  token: z.string(),
  method: z.enum(["interaction", "visible_delay"]),
});

export async function POST(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (!isValidSalesTrackingToken(payload.token)) return NextResponse.json({ error: "invalid_token" }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: lead, error } = await db.from("sales_leads")
    .select("id,status,do_not_contact,website_clicked_at")
    .eq("tracking_token", payload.token)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  if (!lead) return new NextResponse(null, { status: 204 });

  const now = new Date().toISOString();
  const keepStatus = ["interested", "converted", "blocked"].includes(lead.status);
  await Promise.all([
    db.from("sales_tracking_events").insert({
      sales_lead_id: lead.id,
      event_type: "confirmed",
      confirmation_method: payload.method,
      user_agent: request.headers.get("user-agent")?.slice(0, 500) || null,
      request_metadata: {
        sec_fetch_site: fetchSite,
        sec_fetch_mode: request.headers.get("sec-fetch-mode"),
        sec_fetch_dest: request.headers.get("sec-fetch-dest"),
      },
    }),
    db.from("sales_leads").update({
      website_clicked_at: lead.website_clicked_at || now,
      status: keepStatus || lead.do_not_contact ? lead.status : "engaged",
      next_follow_up_at: lead.do_not_contact ? null : now,
      updated_at: now,
    }).eq("id", lead.id),
  ]);

  return new NextResponse(null, { status: 204 });
}
