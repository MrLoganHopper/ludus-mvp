import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=process.env.LUDUS_DATA_FILE||path.join(root,'data','sessions.json');
const url=process.env.SUPABASE_URL?.replace(/\/$/,'');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabase=Boolean(url&&key);
export const storageMode=hasSupabase?'supabase':'local-json';
let queue=Promise.resolve();
async function readLocal(){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
async function writeLocal(data){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(data,null,2));await fs.rename(file+'.tmp',file);}
async function supa(method,table,query='',body){
 const r=await fetch(`${url}/rest/v1/${table}${query}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined});
 const text=await r.text();if(!r.ok)throw new Error(`Supabase ${r.status}: ${text.slice(0,300)}`);return text?JSON.parse(text):null;
}
export async function createSession(session){
 if(hasSupabase){await supa('POST','playtest_sessions','',session);return session;}
 const op=queue.then(async()=>{let data=await readLocal();data[session.id]=session;await writeLocal(data);return session;});queue=op.catch(()=>{});return op;
}
export async function getSession(id){
 if(hasSupabase){return (await supa('GET','playtest_sessions',`?id=eq.${encodeURIComponent(id)}&select=*`))?.[0]??null;}
 return (await readLocal())[id]??null;
}
export async function listSessions(){
 if(hasSupabase)return (await supa('GET','playtest_sessions','?select=*&order=created_at.desc&limit=15'))??[];
 return Object.values(await readLocal()).sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,15);
}
