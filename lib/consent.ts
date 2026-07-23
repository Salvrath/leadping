export type Consent={necessary:true;analytics:boolean;marketing:boolean};
export const defaultConsent:Consent={necessary:true,analytics:false,marketing:false};
export const allows=(consent:Consent,category:keyof Consent)=>category==="necessary"||consent[category];
