import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";

const tokenPattern = /^[0-9a-f-]{36}$/i;

function page(title: string, text: string, form = false) {
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f4ee;color:#10243e;font-family:Arial,sans-serif}.card{width:min(92vw,520px);padding:42px 32px;text-align:center;background:#fff;border:1px solid #dbe4e8;border-radius:20px;box-shadow:0 20px 60px rgba(16,36,62,.12)}img{width:180px;height:auto;margin-bottom:24px}h1{font-size:1.8rem;margin:0 0 12px}p{color:#526277;line-height:1.55;margin:0 0 22px}button,a{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:10px;padding:13px 18px;background:#176b87;color:#fff;text-decoration:none;font-weight:700;cursor:pointer}</style></head><body><main class="card"><img src="/textback-logo.svg" alt="Textback"><h1>${title}</h1><p>${text}</p>${form ? '<form method="post"><button type="submit">Avregistrera e-postadressen</button></form>' : '<a href="/">Till Textback</a>'}</main></body></html>`;
}

async function unsubscribe(token: string) {
  const db = getSupabaseAdmin();
  const { data: lead, error } = await db.from("sales_leads").select("id,email_address,email_status").eq("email_unsubscribe_token", token).maybeSingle();
  if (error) throw new Error("LOOKUP_FAILED");
  if (!lead?.email_address) return false;
  const email = lead.email_address.toLocaleLowerCase("en-US");
  const { data: existing } = await db.from("sales_email_suppressions").select("id").eq("email_address", email).maybeSingle();
  if (!existing) await db.from("sales_email_suppressions").insert({ email_address: email, reason: "unsubscribe", source: "email_link", sales_lead_id: lead.id });
  await db.from("sales_leads").update({ email_status: "unsubscribed", updated_at: new Date().toISOString() }).eq("id", lead.id);
  return true;
}

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  if (!tokenPattern.test(params.token)) return new NextResponse(page("Ogiltig länk", "Avregistreringslänken är inte giltig."), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" } });
  const db = getSupabaseAdmin();
  const { data: lead } = await db.from("sales_leads").select("email_address,email_status").eq("email_unsubscribe_token", params.token).maybeSingle();
  if (!lead?.email_address) return new NextResponse(page("Länken hittades inte", "Adressen kunde inte hittas."), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (lead.email_status === "unsubscribed") return new NextResponse(page("Adressen är redan avregistrerad", "Ni får inga fler e-postkampanjer från Textback till denna adress."), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  return new NextResponse(page("Avregistrera e-post", `Bekräfta att ${lead.email_address} inte ska få fler e-postkampanjer från Textback.`, true), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}

export async function POST(_request: Request, { params }: { params: { token: string } }) {
  if (!tokenPattern.test(params.token)) return new NextResponse(null, { status: 404 });
  try {
    const found = await unsubscribe(params.token);
    if (!found) return new NextResponse(null, { status: 404 });
    return new NextResponse(page("Avregistreringen är klar", "Adressen har spärrats från framtida e-postkampanjer från Textback."), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch {
    return new NextResponse(page("Något gick fel", "Avregistreringen kunde inte genomföras. Kontakta info@textback.se."), { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}