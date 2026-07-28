import Link from "next/link";
import { Activity, AlertTriangle, Building2, Inbox, MessageSquareText, PackageCheck, Phone, Search, Send, UserRoundCog } from "lucide-react";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { AdminCompanyStateForm, AdminConversationStatusForm } from "@/components/admin-actions";
import { AdminEmpty, AdminHeader, AdminStatusBadge } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Textback internpanel" };

const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "–";
const normalize = (value?: string) => (value || "").trim().toLocaleLowerCase("sv-SE");

export default async function AdminPage({ searchParams }: { searchParams?: { q?: string; company?: string; conversation?: string } }) {
  requireAdmin();
  const db = getSupabaseAdmin();
  const [
    { data: numbers },
    { data: conversations },
    { data: calls },
    { count: openIncidents },
    { count: availableNumbers },
    { count: waitingCustomers },
    { count: customerAccounts },
  ] = await Promise.all([
    db.from("textback_numbers").select("id,business_name,provider_number,business_phone_numbers,active,provider,demo_mode,email_notifications_enabled,updated_at").order("business_name"),
    db.from("conversations").select("id,customer_number,status,latest_inbound_preview,last_message_at,textback_numbers(business_name,provider_number)").order("last_message_at", { ascending: false }).limit(100),
    db.from("missed_call_events").select("id,status,reason,caller_number,created_at,sms_delivered_at,textback_numbers(business_name)").order("created_at", { ascending: false }).limit(100),
    db.from("operational_incidents").select("id", { count: "exact", head: true }).is("resolved_at", null),
    db.from("provider_number_inventory").select("id", { count: "exact", head: true }).eq("status", "available"),
    db.from("pilot_leads").select("id", { count: "exact", head: true }).eq("provisioning_status", "awaiting_number").eq("payment_status", "payment_method_saved"),
    db.from("customer_users").select("id", { count: "exact", head: true }).eq("active", true),
  ]);

  const allNumbers = numbers || [];
  const allConversations = conversations || [];
  const allCalls = calls || [];
  const query = normalize(searchParams?.q);
  const companyFilter = ["all", "active", "paused", "demo"].includes(searchParams?.company || "") ? searchParams!.company! : "all";
  const conversationFilter = ["all", "new", "open", "contacted", "closed", "blocked"].includes(searchParams?.conversation || "") ? searchParams!.conversation! : "all";

  const visibleNumbers = allNumbers.filter((number) => {
    const matchesState = companyFilter === "all" || (companyFilter === "active" && number.active) || (companyFilter === "paused" && !number.active) || (companyFilter === "demo" && number.demo_mode);
    const haystack = [number.business_name, number.provider_number, ...(number.business_phone_numbers || [])].join(" ").toLocaleLowerCase("sv-SE");
    return matchesState && (!query || haystack.includes(query));
  });

  const visibleConversations = allConversations.filter((conversation: any) => {
    const company = Array.isArray(conversation.textback_numbers) ? conversation.textback_numbers[0] : conversation.textback_numbers;
    const matchesState = conversationFilter === "all" || conversation.status === conversationFilter;
    const haystack = [company?.business_name, company?.provider_number, conversation.customer_number, conversation.latest_inbound_preview].join(" ").toLocaleLowerCase("sv-SE");
    return matchesState && (!query || haystack.includes(query));
  });

  const sentCalls = allCalls.filter((item) => ["sms_sent", "sms_delivered"].includes(item.status));
  const deliveryRate = sentCalls.length ? Math.round(allCalls.filter((item) => item.status === "sms_delivered").length / sentCalls.length * 100) : 0;
  const stats = {
    active: allNumbers.filter((item) => item.active).length,
    paused: allNumbers.filter((item) => !item.active).length,
    newLeads: allConversations.filter((item) => item.status === "new").length,
    deliveryRate,
    incidents: openIncidents || 0,
    inventory: availableNumbers || 0,
  };

  return <main className="admin-page"><div className="admin-wrap">
    <AdminHeader openIncidents={stats.incidents} availableNumbers={stats.inventory}/>

    <div className="admin-kicker"><Activity size={15}/> Driftöversikt</div>
    <h1 className="admin-title">Det viktigaste i Textback, på ett ställe.</h1>
    <p className="admin-intro">Följ företag, kundärenden, telefoni och leveransstatus. Åtgärder som kräver uppmärksamhet visas först.</p>

    {(stats.incidents > 0 || (waitingCustomers || 0) > 0 || stats.inventory === 0) && <div className="admin-note warning">
      <strong>Åtgärd rekommenderas.</strong> {stats.incidents > 0 ? `${stats.incidents} driftincidenter är öppna. ` : ""}{(waitingCustomers || 0) > 0 ? `${waitingCustomers} kunder väntar på nummer. ` : ""}{stats.inventory === 0 ? "Nummerpoolen saknar lediga nummer." : ""}
    </div>}

    <section className="admin-stats" aria-label="Nyckeltal">
      <article className="admin-card admin-stat"><Building2 size={19}/><strong>{stats.active}</strong><span>Aktiva företag</span></article>
      <article className="admin-card admin-stat"><PackageCheck size={19}/><strong>{stats.paused}</strong><span>Pausade företag</span></article>
      <article className="admin-card admin-stat"><Inbox size={19}/><strong>{stats.newLeads}</strong><span>Nya kundärenden</span></article>
      <article className="admin-card admin-stat"><Send size={19}/><strong>{stats.deliveryRate}%</strong><span>Leveransgrad</span></article>
      <article className={`admin-card admin-stat${stats.incidents ? " attention" : ""}`}><AlertTriangle size={19}/><strong>{stats.incidents}</strong><span>Öppna incidenter</span></article>
      <article className={`admin-card admin-stat${stats.inventory === 0 ? " attention" : ""}`}><Phone size={19}/><strong>{stats.inventory}</strong><span>Lediga 46elks-nummer</span></article>
    </section>

    <section className="admin-action-grid" aria-label="Snabbåtgärder">
      <Link className="admin-card admin-action-card" href="/admin/operations"><Activity size={22}/><div><strong>Kontrollera driften</strong><span>{stats.incidents ? `${stats.incidents} incidenter behöver hanteras` : "Inga öppna incidenter"}</span></div></Link>
      <Link className="admin-card admin-action-card" href="/admin/provider-numbers"><Phone size={22}/><div><strong>Hantera nummerpoolen</strong><span>{waitingCustomers ? `${waitingCustomers} kunder väntar · ${stats.inventory} nummer lediga` : `${stats.inventory} nummer tillgängliga`}</span></div></Link>
      <Link className="admin-card admin-action-card" href="/admin/customers"><UserRoundCog size={22}/><div><strong>Hantera kundkonton</strong><span>{customerAccounts || 0} aktiva portalinloggningar</span></div></Link>
    </section>

    <div className="admin-toolbar">
      <div><div className="admin-kicker"><Search size={14}/> Sök och filtrera</div><p className="admin-intro" style={{marginBottom:0}}>Sök på företag, telefonnummer eller innehåll i senaste kundsvaret.</p></div>
      <form className="admin-search" action="/admin" method="get">
        <label><Search size={16}/><input name="q" defaultValue={searchParams?.q || ""} placeholder="Sök företag, nummer eller lead"/></label>
        <select name="company" defaultValue={companyFilter} aria-label="Företagsstatus"><option value="all">Alla företag</option><option value="active">Aktiva</option><option value="paused">Pausade</option><option value="demo">Demonummer</option></select>
        <select name="conversation" defaultValue={conversationFilter} aria-label="Ärendestatus"><option value="all">Alla ärenden</option><option value="new">Nya</option><option value="open">Pågående</option><option value="contacted">Kontaktade</option><option value="closed">Avslutade</option><option value="blocked">Blockerade</option></select>
        <button className="admin-button primary">Visa</button>
        {(query || companyFilter !== "all" || conversationFilter !== "all") && <Link className="admin-button neutral" href="/admin">Rensa</Link>}
      </form>
    </div>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Företag och nummer</h2><p>{visibleNumbers.length} av {allNumbers.length} företag visas</p></div><Link className="admin-link-button" href="/admin/companies/new">+ Lägg till företag</Link></div>
      {visibleNumbers.length === 0 ? <AdminEmpty title="Inga företag matchar" text="Ändra sökningen eller återställ filtren."/> : <>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Företag</th><th>Textback-nummer</th><th>Ordinarie nummer</th><th>Status</th><th>Notiser</th><th>Senast ändrad</th><th>Åtgärder</th></tr></thead><tbody>
          {visibleNumbers.map((number) => <tr key={number.id}>
            <td><Link href={`/admin/companies/${number.id}`}>{number.business_name}</Link>{number.demo_mode && <div style={{marginTop:5}}><span className="admin-badge demo">Demo</span></div>}</td>
            <td>{number.provider_number}</td><td>{number.business_phone_numbers?.join(", ") || "–"}</td>
            <td><AdminStatusBadge status={number.active ? "active" : "inactive"}/></td>
            <td>{number.email_notifications_enabled ? "Aktiverade" : <span className="muted">Avstängda</span>}</td>
            <td className="muted">{fmt(number.updated_at)}</td>
            <td><div className="admin-actions"><Link className="admin-link-button" href={`/admin/companies/${number.id}`}>Öppna</Link><a className="admin-link-button" href={`/admin/companies/${number.id}/export`}>Exportera</a><AdminCompanyStateForm id={number.id} active={number.active}/></div></td>
          </tr>)}
        </tbody></table></div>
        <div className="admin-mobile-list">{visibleNumbers.map((number) => <article className="admin-mobile-card" key={number.id}><div className="admin-mobile-head"><div><Link href={`/admin/companies/${number.id}`}><strong>{number.business_name}</strong></Link><div className="muted">{number.provider_number}</div></div><AdminStatusBadge status={number.active ? "active" : "inactive"}/></div><div className="admin-mobile-meta"><span>Ordinarie: {number.business_phone_numbers?.join(", ") || "–"}</span><span>E-postnotiser: {number.email_notifications_enabled ? "Aktiverade" : "Avstängda"}</span>{number.demo_mode && <span><AdminStatusBadge status="demo"/></span>}</div><div className="admin-mobile-actions"><Link className="admin-link-button" href={`/admin/companies/${number.id}`}>Öppna</Link><AdminCompanyStateForm id={number.id} active={number.active}/></div></article>)}</div>
      </>}
    </section>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Senaste kundärenden</h2><p>{visibleConversations.length} ärenden matchar filtret</p></div></div>
      {visibleConversations.length === 0 ? <AdminEmpty title="Inga ärenden matchar" text="Nya kundsvar visas här när de kommer in."/> : <>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Tid</th><th>Företag</th><th>Kund</th><th>Senaste svar</th><th>Status</th><th>Ändra</th></tr></thead><tbody>
          {visibleConversations.map((conversation: any) => { const company = Array.isArray(conversation.textback_numbers) ? conversation.textback_numbers[0] : conversation.textback_numbers; return <tr key={conversation.id}><td className="muted">{fmt(conversation.last_message_at)}</td><td><strong>{company?.business_name || "Okänt"}</strong></td><td><Link href={`/admin/conversations/${conversation.id}`}>{conversation.customer_number}</Link></td><td><div className="admin-preview">{conversation.latest_inbound_preview || "Inget svar ännu"}</div></td><td><AdminStatusBadge status={conversation.status}/></td><td><AdminConversationStatusForm id={conversation.id} status={conversation.status}/></td></tr>; })}
        </tbody></table></div>
        <div className="admin-mobile-list">{visibleConversations.map((conversation: any) => { const company = Array.isArray(conversation.textback_numbers) ? conversation.textback_numbers[0] : conversation.textback_numbers; return <article className="admin-mobile-card" key={conversation.id}><div className="admin-mobile-head"><div><strong>{company?.business_name || "Okänt"}</strong><div className="muted">{fmt(conversation.last_message_at)}</div></div><AdminStatusBadge status={conversation.status}/></div><div className="admin-mobile-meta"><Link href={`/admin/conversations/${conversation.id}`}>{conversation.customer_number}</Link><span>{conversation.latest_inbound_preview || "Inget svar ännu"}</span></div><AdminConversationStatusForm id={conversation.id} status={conversation.status}/></article>; })}</div>
      </>}
    </section>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Senaste telefoni och leverans</h2><p>De 100 senaste inkommande händelserna</p></div><Link className="admin-link-button" href="/admin/operations">Öppna driftövervakning</Link></div>
      {allCalls.length === 0 ? <AdminEmpty title="Inga telefonihändelser" text="Händelser visas här när samtal når Textback."/> : <>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Tid</th><th>Företag</th><th>Uppringare</th><th>Status</th><th>Orsak</th><th>Levererad</th></tr></thead><tbody>
          {allCalls.map((call: any) => { const company = Array.isArray(call.textback_numbers) ? call.textback_numbers[0] : call.textback_numbers; return <tr key={call.id}><td className="muted">{fmt(call.created_at)}</td><td><strong>{company?.business_name || "Okänt"}</strong></td><td>{call.caller_number || "Dolt nummer"}</td><td><AdminStatusBadge status={call.status}/></td><td className="muted">{call.reason || "–"}</td><td className="muted">{fmt(call.sms_delivered_at)}</td></tr>; })}
        </tbody></table></div>
        <div className="admin-mobile-list">{allCalls.slice(0,30).map((call: any) => { const company = Array.isArray(call.textback_numbers) ? call.textback_numbers[0] : call.textback_numbers; return <article className="admin-mobile-card" key={call.id}><div className="admin-mobile-head"><div><strong>{company?.business_name || "Okänt"}</strong><div className="muted">{fmt(call.created_at)}</div></div><AdminStatusBadge status={call.status}/></div><div className="admin-mobile-meta"><span>Uppringare: {call.caller_number || "Dolt nummer"}</span><span>Orsak: {call.reason || "–"}</span></div></article>; })}</div>
      </>}
    </section>
  </div></main>;
}
