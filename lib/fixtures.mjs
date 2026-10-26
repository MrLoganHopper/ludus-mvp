/**
 * LUDUS demonstration media. No model inference takes place.
 * A real YouTube video of a human playing FNAF is used for the visual walkthrough.
 * Any findings / annotations below are sample UI copy, NOT observations made by AI.
 */
export const DEFAULT_VIDEO_ID = 'iOztnsBPrAA';
export const GAME = {
  id:'fnaf-video', name:'Five Nights at Freddy’s', subtitle:'YouTube game footage',
  genre:'Survival horror', platform:'YouTube video', sourceType:'youtube',
  description:'Connect a gameplay-video link to preview a game, then view a sample playtest walkthrough.',
  playable:true, fixtureAvailable:true, videoId:DEFAULT_VIDEO_ID,
  externalUrl:`https://www.youtube.com/watch?v=${DEFAULT_VIDEO_ID}`, version:'0.4.0'
};
export const ARCHETYPES = [
  {id:'first-time',number:'01',name:'FIRST-TIME PLAYER',description:'Unfamiliar with the game and its controls'},
  {id:'casual',number:'02',name:'CASUAL PLAYER',description:'Explores the experience without strict goals'},
  {id:'expert',number:'03',name:'EXPERT PLAYER',description:'Strategic and attentive to patterns'},
  {id:'risk',number:'04',name:'RISK TAKER',description:'Willing to take chances to progress'},
  {id:'completionist',number:'05',name:'COMPLETIONIST',description:'Carefully checks every available interaction'},
  {id:'speedrunner',number:'06',name:'SPEEDRUNNER',description:'Attempts the most efficient progression'}
];
// Different nonoverlapping excerpts of the same uploaded URL.
export const PREVIEW = {startSeconds:0,endSeconds:75};
export const SIMULATION = {startSeconds:240,endSeconds:405}; // 165 seconds < 3 minutes
export function youtubeVideoId(raw) {
  if(typeof raw!=='string' || raw.length>2048)return null;
  try{
    const u=new URL(raw.trim()); if(u.protocol!=='https:' && u.protocol!=='http:')return null;
    const host=u.hostname.toLowerCase().replace(/^www\./,'').replace(/^m\./,'');
    let id=null;
    if(host==='youtu.be')id=u.pathname.split('/')[1];
    if(['youtube.com','youtube-nocookie.com'].includes(host)){
      const parts=u.pathname.split('/').filter(Boolean);
      id=parts[0]==='watch'?u.searchParams.get('v'):['embed','shorts','live'].includes(parts[0])?parts[1]:null;
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id||'')?id:null;
  }catch{return null;}
}
const annotations=[
 {id:'demo-1',runId:'run-01',timestampMs:15000,type:'demo_annotation',label:'Example observation marker'},
 {id:'demo-2',runId:'run-01',timestampMs:52000,type:'demo_annotation',label:'Example friction marker'},
 {id:'demo-3',runId:'run-01',timestampMs:103000,type:'demo_annotation',label:'Example opportunity marker'},
 {id:'demo-4',runId:'run-01',timestampMs:147000,type:'demo_annotation',label:'Example wrap-up marker'}
];
export function fixtureFor(archetypeId,videoId=DEFAULT_VIDEO_ID){
  if(!ARCHETYPES.some(a=>a.id===archetypeId))return null;
  const run={id:'run-01',runNumber:1,durationMs:(SIMULATION.endSeconds-SIMULATION.startSeconds)*1000,events:annotations,source:'human_youtube_footage',videoId,startSeconds:SIMULATION.startSeconds,endSeconds:SIMULATION.endSeconds};
  return {id:`fnaf-video-${archetypeId}-v2`,fixtureVersion:'2',source:'human_youtube_footage',gameId:GAME.id,archetypeId,runs:[run],metrics:{clipCount:1,clipSeconds:165,analysisType:'illustrative_only'}};
}
function item(id,label,description,marker,section){return {id:`${section}-${id}`,number:String(id).padStart(2,'0'),label,description,evidence:{runId:'run-01',timestampMs:annotations[marker].timestampMs,eventId:annotations[marker].id,type:'demo_annotation'},evidenceKind:'illustrative_timecode'};}
export function reportFor(archetypeId){
  if(!ARCHETYPES.some(a=>a.id===archetypeId))return null;
  return {version:'2',source:'prepared_illustrative_report',provenance:'Example product-report content. Footage is Markiplier playing FNAF on YouTube. No AI analysis or archetype simulation has occurred.',summary:'Illustrative UX hypotheses for an FNAF playtest, not findings proven by this footage.',metrics:{clipCount:1,clipSeconds:165},sections:{
    worked:{title:'What worked',subtitle:'Sample strengths for a survival-horror game.',findings:[
      item(1,'ATMOSPHERE','Tension-building lighting and sound can sustain engagement.',0,'worked'),
      item(2,'FEEDBACK','Immediate audiovisual cues can make interactions readable.',1,'worked'),
      item(3,'ANTICIPATION','A simple repeated action loop can create suspense.',2,'worked')]},
    broke:{title:'Where it broke',subtitle:'Hypothetical friction to investigate with real players.',findings:[
      item(1,'ONBOARDING','Test whether new players understand how to use the cameras.',1,'broke'),
      item(2,'CLARITY','Check if resource consumption is understood early enough.',2,'broke'),
      item(3,'RECOVERY','Assess whether failure feedback teaches the next attempt.',3,'broke')]},
    improve:{title:'What to improve',subtitle:'Three possible experiments for a future iteration.',findings:[
      item(1,'FIRST-RUN GUIDANCE','Test an optional prompt explaining camera controls.',0,'improve'),
      item(2,'RESOURCE SIGNAL','Test a clearer indicator of remaining power.',1,'improve'),
      item(3,'DEATH RECAP','Test a brief explanation after failed attempts.',3,'improve')]}
  }};
}
