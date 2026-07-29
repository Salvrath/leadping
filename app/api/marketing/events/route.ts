import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase";

const optionalText = z.string().trim().max(500).nullable().optional();
const schema = z.object({
  event: z.enum(["page_view", "demo_phone_clicked", "launch_form_started", "launch_enquiry_submitted"]),
  session_id: z.string().uuid(),
  lead_id: z.string().uuid().optional(),
  path: z.string().trim().startsWith("/").max(500),
  landing_path: optionalText,
  utm_source: optionalText,
  utm_medium: optionalText,
  utm_campaign: optionalText,
  utm_content: optionalText,
  utm_term: optionalText,
  gclid: optionalText,
  gbraid: optionalText,
  wbraid: optionalText,
});

export async function POST(request: Request) {
  let parsed: z.infer<typeof schema>;
  try { parsed = schema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "invalid_event" }, { status: 400 }); }

  const { error } = await getSupabaseAdmin().from("marketing_events").insert({
    event_name: parsed.event,
    session_id: parsed.session_id,
    lead_id: parsed.lead_id || null,
    path: parsed.path,
    landing_path: parsed.landing_path || null,
    utm_source: parsed.utm_source || null,
    utm_medium: parsed.utm_medium || null,
    utm_campaign: parsed.utm_campaign || null,
    utm_content: parsed.utm_content || null,
    utm_term: parsed.utm_term || null,
    gclid: parsed.gclid || null,
    gbraid: parsed.gbraid || null,
    wbraid: parsed.wbraid || null,
  });
  if (error && error.code !== "23505") return NextResponse.json({ error: "event_save_failed" }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}