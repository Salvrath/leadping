import { afterEach, describe, expect, it, vi } from "vitest";
import { processStripeEvent } from "@/lib/server/webhook";
import { notifier } from "@/lib/server/notifications";
import type Stripe from "stripe";

const uuid="00000000-0000-4000-8000-000000000001";
type Options={claims?:boolean[];leadExists?:boolean;leadUpdateError?:boolean;lookupError?:boolean;processedLedgerError?:boolean;errorLedgerError?:boolean};
function database(options:Options={}) {
  const claims=[...(options.claims??[true])];
  const updates:{table:string;values:Record<string,unknown>;id:string}[]=[];
  const db={
    rpc:async()=>({data:claims.shift()??false,error:null}),
    from(table:string){
      return {
        update(values:Record<string,unknown>){
          return {eq(_:string,id:string){return {select(){return {maybeSingle:async()=>{
            updates.push({table,values,id});
            if(table==="pilot_leads") return options.leadUpdateError?{data:null,error:{code:"DB"}}:{data:options.leadExists===false?null:{id},error:null};
            const fails=values.processed_at?options.processedLedgerError:options.errorLedgerError;
            return fails?{data:null,error:{code:"DB"}}:{data:{stripe_event_id:id},error:null};
          }}}}}};
        },
        select(columns:string){
          return {eq(_:string,id:string){return {maybeSingle:async()=>{
            if(options.lookupError)return{data:null,error:{code:"DB"}};
            if(columns==="company")return{data:{company:"Verkstaden"},error:null};
            return{data:options.leadExists===false?null:{id},error:null};
          }}}};
        },
      };
    },
  };
  return{db:db as any,updates};
}
function event(type:string,object:Record<string,unknown>={}){return{id:`evt_${type.replaceAll(".","_")}`,type,data:{object}}as unknown as Stripe.Event}
const session=(extra:Record<string,unknown>={})=>({payment_status:"paid",metadata:{pilot_lead_id:uuid},customer:"cus_1",payment_intent:"pi_1",...extra});

afterEach(()=>vi.restoreAllMocks());
describe("atomic webhook claims",()=>{
  it.each([["new",true,false],["processed",false,true],["in progress",false,true],["previously failed",true,false]])("handles %s events",async(_,claim,duplicate)=>{const{db}=database({claims:[claim]});expect(await processStripeEvent(event("customer.created"),db)).toEqual({duplicate})});
  it("allows only one of two concurrent retry claims",async()=>{const{db}=database({claims:[true,false]});const results=await Promise.all([processStripeEvent(event("customer.created"),db),processStripeEvent(event("customer.created"),db)]);expect(results.filter(x=>x.duplicate)).toHaveLength(1)});
});

describe("Stripe webhook completion",()=>{
  it.each(["checkout.session.completed","checkout.session.async_payment_succeeded"])("marks %s paid",async type=>{const{db,updates}=database();await processStripeEvent(event(type,session()),db);expect(updates).toContainEqual(expect.objectContaining({table:"pilot_leads",values:expect.objectContaining({status:"pilot_paid",payment_status:"paid"})}));expect(updates.at(-1)?.values.processed_at).toBeTruthy()});
  it.each([["checkout.session.async_payment_failed","failed"],["checkout.session.expired","expired"]])("handles %s",async(type,status)=>{const{db,updates}=database();await processStripeEvent(event(type,session()),db);expect(updates.some(x=>x.values.payment_status===status)).toBe(true)});
  it("handles refunds",async()=>{const{db,updates}=database();await processStripeEvent(event("charge.refunded",{metadata:{pilot_lead_id:uuid}}),db);expect(updates.some(x=>x.values.payment_status==="refunded"&&x.values.refunded_at)).toBe(true)});
  it("finishes unknown valid event types",async()=>{const{db,updates}=database();await processStripeEvent(event("customer.created"),db);expect(updates.at(-1)?.values.processed_at).toBeTruthy()});
  it("does not finish events with missing metadata",async()=>{const{db,updates}=database();await expect(processStripeEvent(event("checkout.session.expired",{}),db)).rejects.toThrow("WEBHOOK_METADATA_MISSING");expect(updates.some(x=>x.values.processed_at)).toBe(false);expect(updates.at(-1)?.values.processing_error).toBe("WEBHOOK_METADATA_MISSING")});
  it("does not finish a valid but unknown lead",async()=>{const{db,updates}=database({leadExists:false});await expect(processStripeEvent(event("checkout.session.expired",session()),db)).rejects.toThrow("WEBHOOK_LEAD_NOT_FOUND");expect(updates.some(x=>x.values.processed_at)).toBe(false);expect(updates.at(-1)?.values.processing_error).toBe("WEBHOOK_LEAD_NOT_FOUND")});
  it("returns failure when a lead update fails",async()=>{const{db}=database({leadUpdateError:true});await expect(processStripeEvent(event("checkout.session.expired",session()),db)).rejects.toThrow("WEBHOOK_LEAD_UPDATE_FAILED")});
  it("returns failure when ledger completion fails",async()=>{vi.spyOn(console,"error").mockImplementation(()=>{});const{db}=database({processedLedgerError:true});await expect(processStripeEvent(event("customer.created"),db)).rejects.toThrow("WEBHOOK_LEDGER_UPDATE_FAILED")});
  it("keeps payment successful when notification delivery fails",async()=>{vi.spyOn(notifier,"payment").mockRejectedValue(new Error("mail"));vi.spyOn(console,"error").mockImplementation(()=>{});const{db,updates}=database();await expect(processStripeEvent(event("checkout.session.completed",session()),db)).resolves.toEqual({duplicate:false});expect(updates.at(-1)?.values.processed_at).toBeTruthy()});
});
