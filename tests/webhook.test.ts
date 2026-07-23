import { describe, expect, it } from "vitest";
import { processStripeEvent } from "@/lib/server/webhook";
import type Stripe from "stripe";

function database(duplicate=false) {
  const updates: {table:string; values:Record<string,unknown>; id:string}[]=[];
  const db={from(table:string){return {
    insert: async()=>({error:duplicate?{code:"23505"}:null}),
    update:(values:Record<string,unknown>)=>({eq:async(_:string,id:string)=>{updates.push({table,values,id});return{error:null}}}),
    select:()=>({eq:()=>({maybeSingle:async()=>({data:{company:"Verkstaden"},error:null})})}),
  }}};
  return {db:db as any,updates};
}
function event(type:string,object:Record<string,unknown>) {return {id:"evt_1",type,data:{object}} as unknown as Stripe.Event;}

describe("Stripe webhook processing",()=>{
  it("marks a completed paid checkout",async()=>{const {db,updates}=database();await processStripeEvent(event("checkout.session.completed",{payment_status:"paid",metadata:{pilot_lead_id:"00000000-0000-4000-8000-000000000001"},customer:"cus_1",payment_intent:"pi_1"}),db);expect(updates.some(x=>x.values.payment_status==="paid"&&x.values.status==="pilot_paid")).toBe(true)});
  it("marks failed and expired payments",async()=>{for(const [type,status] of [["checkout.session.async_payment_failed","failed"],["checkout.session.expired","expired"]]){const {db,updates}=database();await processStripeEvent(event(type,{metadata:{pilot_lead_id:"00000000-0000-4000-8000-000000000001"}}),db);expect(updates.some(x=>x.values.payment_status===status)).toBe(true)}});
  it("marks refunds",async()=>{const {db,updates}=database();await processStripeEvent(event("charge.refunded",{metadata:{pilot_lead_id:"00000000-0000-4000-8000-000000000001"}}),db);expect(updates.some(x=>x.values.payment_status==="refunded"&&x.values.refunded_at)).toBe(true)});
  it("does not process the same event twice",async()=>{const {db,updates}=database(true);expect(await processStripeEvent(event("checkout.session.expired",{}),db)).toEqual({duplicate:true});expect(updates).toHaveLength(0)});
});
