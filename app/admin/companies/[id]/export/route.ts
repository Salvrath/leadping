import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/server/admin-auth";
import { auditEvent } from "@/lib/server/security";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!isAdminAuthenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  const id = params.id;
  const [{ data: company, error: companyError }, { data: users }, { data: conversations }, { data: calls }] = await Promise.all([
    db.from("textback_numbers").select("*").eq("id", id).maybeSingle(),
    db.from("customer_users").select("id,email,active,last_login_at,created_at,updated_at").eq("textback_number_id", id),
    db.from("conversations").select("*").eq("textback_number_id", id).order("created_at"),
    db.from("missed_call_events").select("*").eq("textback_number_id", id).order("created_at"),
  ]);
  if (companyError || !company) return NextResponse.json({ error: "company_not_found" }, { status: 404 });
  const conversationIds = (conversations || []).map((item) => item.id);
  const { data: messages } = conversationIds.length
    ? await db.from("sms_messages").select("*").in("conversation_id", conversationIds).order("created_at")
    : { data: [] };

  const exportedAt = new Date().toISOString();
  const payload = {
    schema: "textback-company-export-v1",
    exported_at: exportedAt,
    company,
    portal_users: users || [],
    conversations: conversations || [],
    sms_messages: messages || [],
    missed_calls: calls || [],
  };
  await auditEvent({ actor: { type: "admin", id: "internal-admin" }, action: "company.data_exported", targetType: "textback_number", targetId: id, metadata: { exported_at: exportedAt, conversations: conversationIds.length, messages: (messages || []).length } });
  const safeName = String(company.business_name || "company").toLowerCase().replace(/[^a-z0-9åäö]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "company";
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="textback-${safeName}-${exportedAt.slice(0,10)}.json"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
