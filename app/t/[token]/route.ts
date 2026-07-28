import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/site";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.redirect(`${siteUrl}/`);
  const db = getSupabaseAdmin();
  const { data: lead } = await db.from("sales_leads").select("id,status,do_not_contact").eq("tracking_token", token).maybeSingle();
  if (lead) {
    const keepStatus = ["interested", "converted", "blocked"].includes(lead.status);
    await db.from("sales_leads").update({
      website_clicked_at: new Date().toISOString(),
      status: keepStatus || lead.do_not_contact ? lead.status : "engaged",
      next_follow_up_at: lead.do_not_contact ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", lead.id);
  }
  return NextResponse.redirect(`${siteUrl}/#intresse`, 302);
}
