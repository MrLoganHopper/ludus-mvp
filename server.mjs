import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
const projectRoot=path.dirname(fileURLToPath(import.meta.url));
// Load optional local .env before initializing persistence module.
try { const str=await fs.readFile(path.join(projectRoot,'.env'),'utf8');for(const line of str.split(/\r?\n/)){const m=line.match(/^\s*([A-Z][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);if(m&&!Object.hasOwn(process.env,m[1]))process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');} } catch(e){if(e.code!=='ENOENT')throw e;}
const {GAME,ARCHETYPES,fixtureFor,reportFor,DEFAULT_VIDEO_ID,youtubeVideoId}=await import('./lib/fixtures.mjs');
const {createSession,getSession,listSessions,storageMode}=await import('./lib/store.mjs');
const PORT=Number(process.env.PORT||3000);
const publicRoot=path.resolve(projectRoot,'public');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.json':'application/json; charset=utf-8'};
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
function pageError(res,status,message){json(res,status,{error:message});}
function isSessionId(str){return /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(str);}
function directVideoUrl(raw){if(typeof raw!=='string'||raw.length>2048)return null;try{const u=new URL(raw.trim());return u.protocol==='https:'&&/\.(mp4|webm|ogg|m3u8)(?:$|[?#])/i.test(u.pathname+u.search)?u.href:null;}catch{return null;}}
async function bodyJson(req){let b='';for await(const chunk of req){b+=chunk;if(b.length>8192)throw new Error('Request body too large');}try{return JSON.parse(b||'{}');}catch{throw new Error('Invalid JSON body');}}
function optionalGame(){const title=process.env.ITCH_GAME_TITLE,embed=process.env.ITCH_EMBED_URL,external=process.env.ITCH_EXTERNAL_URL;if(!title||(!embed&&!external))return null;const safeEmbed=embed&&/^https:\/\//.test(embed)?embed:null;const safeExternal=external&&/^https:\/\//.test(external)?external:null;return {id:'itch-example',name:title,subtitle:'HTML5 / Itch.io',genre:'Indie',platform:'Browser',description:'An externally hosted, independently playable game.',sourceType:'itch_html5',embedUrl:safeEmbed,externalUrl:safeExternal,playable:Boolean(safeEmbed||safeExternal),fixtureAvailable:false};}
async function api(req,res,pathname,search){
 try{
  if(req.method==='GET'&&pathname==='/api/health')return json(res,200,{ok:true,storageMode,version:'0.4.0'});
  if(req.method==='GET'&&pathname==='/api/games')return json(res,200,{games:[GAME]});
  if(req.method==='GET'&&pathname==='/api/archetypes')return json(res,200,{archetypes:ARCHETYPES.map(({speed,noise,hunger,safety,...a})=>({...a,fixtureAvailable:search.get('gameId')===GAME.id}))});
  if(req.method==='GET'&&pathname==='/api/playtests')return json(res,200,{sessions:await listSessions()});
  if(req.method==='POST'&&pathname==='/api/playtests'){
   if(!req.headers['content-type']?.startsWith('application/json'))return pageError(res,415,'Expected application/json');
   const v=await bodyJson(req);
   if(v.gameId!==GAME.id)return pageError(res,422,'Only connected FNAF video demos are supported');
   const videoId=youtubeVideoId(v.gameUrl||'') || directVideoUrl(v.gameUrl||'') || (typeof v.videoId==='string' && /^[a-zA-Z0-9_-]{11}$/.test(v.videoId)?v.videoId:null);
   if(!videoId)return pageError(res,422,'Connect a valid YouTube link or direct MP4/WEBM/HLS video URL first');
   if(!ARCHETYPES.some(a=>a.id===v.archetypeId))return pageError(res,422,'Choose a supported archetype');
   if(v.mode&&v.mode!=='demo')return pageError(res,422,'This MVP supports prepared demo playback only');
   if(v.runCount!=null&&v.runCount!==1)return pageError(res,422,'The prepared demonstration contains one video clip');
   const fixture=fixtureFor(v.archetypeId,videoId);
   const session={id:crypto.randomUUID(),game_id:v.gameId,archetype_id:v.archetypeId,fixture_id:fixture.id,execution_mode:'demo',requested_run_count:1,video_id:videoId,status:'ready',created_at:new Date().toISOString(),last_viewed_at:null};
   await createSession(session);
   return json(res,201,{sessionId:session.id,status:'ready',executionMode:'demo',replayId:fixture.id,reportAvailable:true});
  }
  let m=pathname.match(/^\/api\/playtests\/([a-z0-9-]+)(?:\/(replay|report))?$/i);
  if(req.method==='GET'&&m){
   const id=m[1],resource=m[2];if(!isSessionId(id))return pageError(res,404,'Session not found');
   const s=await getSession(id);if(!s)return pageError(res,404,'Session not found');
   const a=ARCHETYPES.find(x=>x.id===s.archetype_id);const session={...s,game:{...GAME,videoId:s.video_id||DEFAULT_VIDEO_ID,externalUrl:`https://www.youtube.com/watch?v=${s.video_id||DEFAULT_VIDEO_ID}`},archetype:a?{id:a.id,name:a.name,description:a.description}:null};
   if(!resource)return json(res,200,{session});
   if(resource==='report')return json(res,200,{sessionId:s.id,report:reportFor(s.archetype_id)});
   const fixture=fixtureFor(s.archetype_id,s.video_id||DEFAULT_VIDEO_ID),runNo=1;
   const run=fixture.runs[runNo-1];
   return json(res,200,{sessionId:s.id,source:'scripted_fixture',fixtureVersion:fixture.fixtureVersion,executionMode:'demo',run,runSummaries:fixture.runs.map(({id,runNumber,durationMs})=>({id,runNumber,durationMs})),metrics:fixture.metrics});
  }
  return pageError(res,404,'Not found');
 }catch(e){console.error('API error',e);return pageError(res,e.message==='Invalid JSON body'||e.message==='Request body too large'?400:503,e.message?.startsWith('Supabase')?'Session storage unavailable':e.message||'Unexpected server error');}
}
async function serveFile(res,relative){let target=path.resolve(publicRoot,'.'+relative);if(target!==publicRoot&&!target.startsWith(publicRoot+path.sep))return pageError(res,403,'Forbidden');try{let data=await fs.readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':relative.startsWith('/assets/')?'public, max-age=3600':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);}catch(e){if(e.code==='ENOENT')return pageError(res,404,'Asset not found');throw e;}}
const server=http.createServer(async(req,res)=>{
 let parsed;try{parsed=new URL(req.url,'http://localhost');}catch{return pageError(res,400,'Invalid URL');}
 const p=decodeURIComponent(parsed.pathname);
 if(p.startsWith('/api/'))return api(req,res,p,parsed.searchParams);
 if(req.method!=='GET'&&req.method!=='HEAD')return pageError(res,405,'Method not allowed');
 if(p.startsWith('/assets/'))return serveFile(res,p);
 if(p==='/app.css'||p==='/app.js')return serveFile(res,p);
 if(p==='/'||p==='/games'||p==='/archetypes'||/^\/playtests\/[a-f0-9-]+\/(view|report)$/.test(p))return serveFile(res,'/index.html');
 return pageError(res,404,'Page not found');
});
server.listen(PORT,'0.0.0.0',()=>console.log(`LUDUS MVP at http://localhost:${PORT}  [${storageMode} storage]`));
