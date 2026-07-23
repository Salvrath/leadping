import type {Lead} from "./lead-schema";
export interface LeadStorage{save(lead:Lead):Promise<{id:string}>}
export const developmentLeadStorage:LeadStorage={async save(lead){const id=crypto.randomUUID();console.info(JSON.stringify({type:"pilot_lead",id,createdAt:new Date().toISOString(),lead}));return{id};}};
export const leadStorage:LeadStorage=developmentLeadStorage;
