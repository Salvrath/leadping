import { describe, expect, it, vi } from "vitest";
import { createPilotCheckoutWithStripe } from "@/lib/server/stripe";
import type { LeadStorage } from "@/lib/lead-storage";

const id="00000000-0000-4000-8000-000000000001";
function setup(found=true){
  const storage:LeadStorage={save:vi.fn(),find:vi.fn().mockResolvedValue(found?{id,email:"pilot@example.se",company:"Verkstaden"}:null),update:vi.fn()};
  const create=vi.fn().mockResolvedValue({id:"cs_test",url:"https://checkout.stripe.com/c/pay/cs_test"});
  const stripe={checkout:{sessions:{create}}} as any;
  return{storage,create,stripe};
}
describe("pilot checkout",()=>{
  it("uses configured Price, metadata, safe URLs and stable idempotency",async()=>{const{storage,create,stripe}=setup();const url=await createPilotCheckoutWithStripe(id,storage,stripe,{price:"price_test",site:"https://textback.example"});expect(url).toBe("https://checkout.stripe.com/c/pay/cs_test");expect(create).toHaveBeenCalledWith(expect.objectContaining({customer_email:"pilot@example.se",line_items:[{price:"price_test",quantity:1}],metadata:{pilot_lead_id:id},payment_intent_data:{metadata:{pilot_lead_id:id}},success_url:"https://textback.example/pilot/tack?session_id={CHECKOUT_SESSION_ID}",cancel_url:`https://textback.example/pilot/avbruten?lead_id=${id}`}),{idempotencyKey:`textback-pilot-${id}`});expect(storage.update).toHaveBeenCalledWith(id,expect.objectContaining({status:"checkout_started",payment_status:"checkout_created",stripe_checkout_session_id:"cs_test"}))});
  it("does not create checkout for an unknown lead",async()=>{const{storage,create,stripe}=setup(false);await expect(createPilotCheckoutWithStripe(id,storage,stripe,{price:"price_test",site:"https://textback.example"})).rejects.toThrow("LEAD_NOT_FOUND");expect(create).not.toHaveBeenCalled()});
  it("rejects invalid lead IDs and unsafe site URLs",async()=>{const{storage,stripe}=setup();await expect(createPilotCheckoutWithStripe("not-uuid",storage,stripe,{price:"price_test",site:"https://textback.example"})).rejects.toThrow();await expect(createPilotCheckoutWithStripe(id,storage,stripe,{price:"price_test",site:"javascript:alert(1)"})).rejects.toThrow("PAYMENTS_NOT_CONFIGURED")});
});
