import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ARCHETYPES,fixtureFor,reportFor,youtubeVideoId,DEFAULT_VIDEO_ID,PREVIEW,SIMULATION} from '../lib/fixtures.mjs';

test('all six archetypes use one identical human-footage clip, with no invented runs',()=>{
 assert.equal(ARCHETYPES.length,6);
 assert.ok(SIMULATION.startSeconds>=PREVIEW.endSeconds);
 assert.ok(SIMULATION.endSeconds-SIMULATION.startSeconds<=180);
 for(const a of ARCHETYPES){
  const fx=fixtureFor(a.id);
  assert.equal(fx.runs.length,1);
  assert.equal(fx.source,'human_youtube_footage');
  assert.equal(fx.runs[0].videoId,DEFAULT_VIDEO_ID);
  assert.equal(fx.runs[0].durationMs,165000);
  for(const event of fx.runs[0].events){assert.equal(event.type,'demo_annotation');assert.ok(event.timestampMs<=fx.runs[0].durationMs);}
 }
});

test('replay evidence resolves to a real run and a real event',()=>{
 for(const a of ARCHETYPES){
  const fixture=fixtureFor(a.id),report=reportFor(a.id);
  for(const section of Object.values(report.sections)){
   assert.equal(section.findings.length,3);
   for(const f of section.findings){
    assert.ok(f.evidence,`Evidence missing for ${a.id}/${f.id}`);
    const run=fixture.runs.find(r=>r.id===f.evidence.runId);
    assert.ok(run,`Missing run ${f.evidence.runId}`);
    const event=run.events.find(e=>e.id===f.evidence.eventId);
    assert.ok(event,`Missing event ${f.evidence.eventId}`);
    assert.equal(event.timestampMs,f.evidence.timestampMs);
   }
  }
 }
});

test('video links validate genuine YouTube origins and reject unsafe URLs',()=>{
 assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=iOztnsBPrAA'),DEFAULT_VIDEO_ID);
 assert.equal(youtubeVideoId('https://youtu.be/iOztnsBPrAA?t=45'),DEFAULT_VIDEO_ID);
 assert.equal(youtubeVideoId('https://youtube.com/embed/iOztnsBPrAA'),DEFAULT_VIDEO_ID);
 assert.equal(youtubeVideoId('https://youtube.com.evil.example/watch?v=iOztnsBPrAA'),null);
 assert.equal(youtubeVideoId('javascript:alert(1)'),null);
 assert.equal(youtubeVideoId('not a URL'),null);
});
