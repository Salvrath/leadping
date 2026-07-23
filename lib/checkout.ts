export function getCheckout(url?:string){return url?.startsWith("https://")?{href:url,ready:true}:{href:"#checkout-unavailable",ready:false};}
