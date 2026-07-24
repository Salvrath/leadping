import { beforeEach, describe, expect, it, vi } from "vitest";
const constructEvent=vi.fn();
const processStripeEvent=vi.fn();
vi.mock("@/lib/server/stripe",()=>({getStripe:()=>({webhooks:{constructEvent}})}));
vi.mock("@/lib/server/webhook",()=>({processStripeEvent:(...args:unknown[])=>processStripeEvent(...args)}));
import { POST } from "@/app/api/stripe/webhook/route";

describe("Stripe webhook route",()=>{
  beforeEach(()=>{vi.clearAllMocks();process.env.STRIPE_WEBHOOK_SECRET="whsec_test";vi.spyOn(console,"error").mockImplementation(()=>{})});
  it("rejects invalid signatures",async()=>{constructEvent.mockImplementation(()=>{throw new Error("signature verification failed")});const response=await POST(new Request("http://localhost/api/stripe/webhook",{method:"POST",body:"{}",headers:{"stripe-signature":"bad"}}));expect(response.status).toBe(400)});
  it("returns 500 so Stripe retries an unknown lead",async()=>{constructEvent.mockReturnValue({id:"evt_1"});processStripeEvent.mockRejectedValue(new Error("WEBHOOK_LEAD_NOT_FOUND"));const response=await POST(new Request("http://localhost/api/stripe/webhook",{method:"POST",body:"{}",headers:{"stripe-signature":"valid"}}));expect(response.status).toBe(500)});
});
