"use server";
import {leadSchema} from "@/lib/lead-schema";import {leadStorage} from "@/lib/lead-storage";
export type FormState={success:boolean;errors?:Record<string,string[]>;id?:string};
export async function submitPilot(_:FormState,data:FormData):Promise<FormState>{const raw=Object.fromEntries(data);const parsed=leadSchema.safeParse({...raw,privacy:raw.privacy==="on",authority:raw.authority==="on"});if(!parsed.success)return{success:false,errors:parsed.error.flatten().fieldErrors};const saved=await leadStorage.save(parsed.data);return{success:true,id:saved.id};}
