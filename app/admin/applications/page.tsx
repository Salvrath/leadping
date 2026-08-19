import { CalendarDays, ExternalLink, FileText, Mail, Phone, Search, UserRound } from "lucide-react";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { AdminEmpty, AdminHeader } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Formulär | Textback internpanel" };

const fmt = (value?: string | null) => value
  ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
  : "–";

const normalize = (value?: string | null) => (value || "").trim().toLocaleLowerCase("sv-SE");

const formStatusLabel: Record<string, string> = {
  application_submitted: "Inskickat",
  checkout_started: "Checkout startad",
  active: "Aktiv",
  completed: "Klar",
  canceled: "Avbruten",
};

const paymentLabel: Record<string, string> = {
  not_started: "Inte påbörjad",
  checkout_created: "Checkout skapad",
  payment_method_saved: "Betalmetod sparad",
  paid: "Betald",
  refunded: "Återbetald",
  failed: "Misslyckad",
};

const provisioningLabel: Record<string, string> = {
  not_started: "Inte påbörjad",
  awaiting_payment_method: "Väntar på betalmetod",
  awaiting_number: "Väntar på nummer",
  provisioning: "Ansluter",
  provisioned: "Ansluten",
  failed: "Misslyckad",
};

function valueOrDash(value?: string | number | null) {
  return value === null || value === undefined || value === "" ? "–" : String(value);
}

export default async function ApplicationsPage({ searchParams }: { searchParams?: { q?: string } }) {
  requireAdmin();
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("pilot_leads")
    .select("id,created_at,company,contact_name,email,phone,workshop_phone,telephony,missed_calls_per_week,phone_numbers,industry,message,status,payment_status,provisioning_status,textback_number_id,utm_source,utm_medium,utm_campaign,landing_path,referrer")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error("FORM_SUBMISSIONS_LOAD_FAILED");

  const applications = data || [];
  const query = normalize(searchParams?.q);
  const visible = applications.filter((application) => {
    if (!query) return true;
    const haystack = [
      application.company,
      application.contact_name,
      application.email,
      application.phone,
      application.workshop_phone,
      application.industry,
      application.telephony,
      application.utm_source,
      application.utm_campaign,
      application.message,
    ].join(" ").toLocaleLowerCase("sv-SE");
    return haystack.includes(query);
  });

  const newest = applications[0]?.created_at || null;
  const attributed = applications.filter((application) => application.utm_source || application.utm_campaign || application.referrer).length;
  const connected = applications.filter((application) => application.textback_number_id || application.provisioning_status === "provisioned").length;

  return <main className="admin-page"><div className="admin-wrap">
    <AdminHeader/>

    <div className="admin-kicker"><FileText size={15}/> Webbformulär</div>
    <h1 className="admin-title">Inskickade formulär</h1>
    <p className="admin-intro">Alla företag som har skickat in formuläret på textback.se visas här, inklusive tidigare inskickade formulär.</p>

    <section className="admin-stats" aria-label="Formulärstatistik">
      <article className="admin-card admin-stat"><FileText size={19}/><strong>{applications.length}</strong><span>Totalt inskickade</span></article>
      <article className="admin-card admin-stat"><CalendarDays size={19}/><strong>{newest ? fmt(newest).split(" ")[0] : "–"}</strong><span>Senaste formuläret</span></article>
      <article className="admin-card admin-stat"><ExternalLink size={19}/><strong>{attributed}</strong><span>Med trafikkälla</span></article>
      <article className="admin-card admin-stat"><UserRound size={19}/><strong>{connected}</strong><span>Anslutna</span></article>
    </section>

    <div className="admin-toolbar">
      <div><div className="admin-kicker"><Search size={14}/> Sök formulär</div><p className="admin-intro" style={{marginBottom:0}}>Sök på företag, kontaktperson, e-post, telefon, bransch eller meddelande.</p></div>
      <form className="admin-search" action="/admin/applications" method="get">
        <label><Search size={16}/><input name="q" defaultValue={searchParams?.q || ""} placeholder="Sök företag eller kontakt"/></label>
        <button className="admin-button primary">Sök</button>
        {query && <a className="admin-button neutral" href="/admin/applications">Rensa</a>}
      </form>
    </div>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Företag som fyllt i formuläret</h2><p>{visible.length} av {applications.length} formulär visas</p></div></div>

      {visible.length === 0 ? <AdminEmpty title="Inga formulär matchar" text="Ändra sökningen eller återställ filtret."/> : <>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr>
          <th>Inskickat</th><th>Företag</th><th>Kontakt</th><th>Kontaktuppgifter</th><th>Verksamhet</th><th>Telefoni</th><th>Missade samtal</th><th>Meddelande</th><th>Status</th><th>Källa</th>
        </tr></thead><tbody>
          {visible.map((application) => <tr key={application.id}>
            <td className="muted">{fmt(application.created_at)}</td>
            <td><strong>{application.company}</strong>{application.phone_numbers > 1 && <div className="muted">{application.phone_numbers} nummer</div>}</td>
            <td>{application.contact_name}</td>
            <td><div style={{display:"grid",gap:4}}><a href={`mailto:${application.email}`}><Mail size={13} style={{verticalAlign:"-2px",marginRight:5}}/>{application.email}</a><a href={`tel:${application.phone}`}><Phone size={13} style={{verticalAlign:"-2px",marginRight:5}}/>{application.phone}</a><span className="muted">Företag: {application.workshop_phone}</span></div></td>
            <td>{valueOrDash(application.industry)}</td>
            <td>{valueOrDash(application.telephony)}</td>
            <td>{application.missed_calls_per_week ?? 0}/vecka</td>
            <td><div className="admin-preview">{application.message || "–"}</div></td>
            <td><div style={{display:"grid",gap:4}}><span><strong>Formulär:</strong> {formStatusLabel[application.status] || valueOrDash(application.status)}</span><span className="muted">Betalning: {paymentLabel[application.payment_status] || application.payment_status}</span><span className="muted">Anslutning: {provisioningLabel[application.provisioning_status] || application.provisioning_status}</span></div></td>
            <td><div style={{display:"grid",gap:4}}><span>{application.utm_source || application.referrer || "Direkt/okänd"}</span>{application.utm_campaign && <span className="muted">{application.utm_campaign}</span>}{application.landing_path && <span className="muted">{application.landing_path}</span>}</div></td>
          </tr>)}
        </tbody></table></div>

        <div className="admin-mobile-list">{visible.map((application) => <article className="admin-mobile-card" key={application.id}>
          <div className="admin-mobile-head"><div><strong>{application.company}</strong><div className="muted">{fmt(application.created_at)}</div></div><span className="admin-badge">{application.provisioning_status === "provisioned" ? "Ansluten" : "Formulär"}</span></div>
          <div className="admin-mobile-meta">
            <span><strong>{application.contact_name}</strong></span>
            <a href={`mailto:${application.email}`}>{application.email}</a>
            <a href={`tel:${application.phone}`}>{application.phone}</a>
            <span>Företagsnummer: {application.workshop_phone}</span>
            <span>Bransch: {valueOrDash(application.industry)}</span>
            <span>Telefoni: {valueOrDash(application.telephony)}</span>
            <span>Missade samtal: {application.missed_calls_per_week ?? 0}/vecka</span>
            <span>Status: {formStatusLabel[application.status] || valueOrDash(application.status)}</span>
            <span>Källa: {application.utm_source || application.referrer || "Direkt/okänd"}</span>
            {application.message && <span>Meddelande: {application.message}</span>}
          </div>
        </article>)}</div>
      </>}
    </section>
  </div></main>;
}
