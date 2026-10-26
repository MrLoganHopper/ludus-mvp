import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function wait(ms){return new Promise(r=>setTimeout(r,ms));}

test('HTTP workflow: game -> archetypes -> create -> replay -> report -> persistence',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ludus-test-'));
  const port=31000+Math.floor(Math.random()*2000),base=`http://127.0.0.1:${port}`;
  const proc=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',LUDUS_DATA_FILE:path.join(temp,'sessions.json')},stdio:'ignore'});
  try{
    let ready=false;
    for(let i=0;i<30;i++){try{let r=await fetch(`${base}/api/health`);if(r.ok){ready=true;break;}}catch{}await wait(120);}
    assert.ok(ready,'Server failed to start');
    const games=await (await fetch(`${base}/api/games`)).json();assert.equal(games.games[0].id,'fnaf-video');
    const arches=await (await fetch(`${base}/api/archetypes?gameId=fnaf-video`)).json();assert.equal(arches.archetypes.length,6);
    const bad=await fetch(`${base}/api/playtests`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameId:'unknown',archetypeId:'first-time'})});assert.equal(bad.status,422);
    const created=await (await fetch(`${base}/api/playtests`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameId:'fnaf-video',gameUrl:'https://www.youtube.com/watch?v=iOztnsBPrAA',archetypeId:'first-time',runCount:1,mode:'demo'})})).json();
    assert.match(created.sessionId,/^[a-f0-9-]{36}$/);
    let s=await (await fetch(`${base}/api/playtests/${created.sessionId}`)).json();assert.equal(s.session.execution_mode,'demo');assert.equal(s.session.video_id,'iOztnsBPrAA');
    const replay=await (await fetch(`${base}/api/playtests/${created.sessionId}/replay?run=1`)).json();assert.equal(replay.run.runNumber,1);assert.equal(replay.run.videoId,'iOztnsBPrAA');assert.equal(replay.run.endSeconds-replay.run.startSeconds,165);
    const report=await (await fetch(`${base}/api/playtests/${created.sessionId}/report`)).json();assert.equal(report.report.sections.improve.findings.length,3);assert.equal(report.report.source,'prepared_illustrative_report');
    const history=await (await fetch(`${base}/api/playtests`)).json();assert.equal(history.sessions.length,1);
    assert.ok((await fs.readFile(path.join(temp,'sessions.json'),'utf8')).includes(created.sessionId));
    const second=await (await fetch(`${base}/api/playtests`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameId:'fnaf-video',gameUrl:'https://youtu.be/Zz000000000',archetypeId:'expert',runCount:1,mode:'demo'})})).json();assert.ok(second.sessionId);
    const secondReplay=await (await fetch(`${base}/api/playtests/${second.sessionId}/replay`)).json();assert.equal(secondReplay.run.videoId,'Zz000000000');
    const rejected=await fetch(`${base}/api/playtests`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameId:'fnaf-video',gameUrl:'https://evil.com/watch?v=iOztnsBPrAA',archetypeId:'expert',runCount:1})});assert.equal(rejected.status,422);
  }finally{proc.kill('SIGTERM');await fs.rm(temp,{recursive:true,force:true});}
});
