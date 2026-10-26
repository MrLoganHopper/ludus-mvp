/* LUDUS / PLAYTEST OS
 * A front-end for a transparent, fixture-based product demonstration.
 * A connected YouTube gameplay video powers the preview and the demonstration clip.
 * Footage is recorded human gameplay, NOT AI-generated or an archetype simulation.
 */
(() => {
  'use strict';
  const $app = document.querySelector('#app');
  const API = '/api';
  const labels = ['GAME','ARCHETYPE','SIMULATION','REPORT'];
  let routeVersion = 0;
  let toastTimer;
  const DEMO_VIDEO_ID='iOztnsBPrAA';
  const DEFAULT_VIDEO_URL="https://game-videos-mvp.s3.us-west-1.amazonaws.com/Five+Nights+at+Freddy's+_+Full+Game+Walkthrough+_+No+Commentary_20_116.mp4";
  const SIMULATION_VIDEO_URL="https://game-videos-mvp.s3.us-west-1.amazonaws.com/Five+Nights+at+Freddy's+Simulation.mp4";
  const SIM_START_SECONDS=240, SIM_END_SECONDS=405;
  let youtubePlayer=null, youtubeScriptPromise=null, youtubeInstanceToken=0;
  // Only allow YouTube player URLs, never arbitrary iframe markup or third-party origins.
  function youtubeId(raw){
    if(typeof raw!=='string'||raw.length>2048)return null;
    try{const u=new URL(raw.trim());if(!['https:','http:'].includes(u.protocol))return null;
      const h=u.hostname.toLowerCase().replace(/^www\./,'').replace(/^m\./,'');
      const seg=u.pathname.split('/').filter(Boolean);let id=null;
      if(h==='youtu.be')id=seg[0];
      if(['youtube.com','youtube-nocookie.com'].includes(h))id=seg[0]==='watch'?u.searchParams.get('v'):['embed','shorts','live'].includes(seg[0])?seg[1]:null;
      return /^[a-zA-Z0-9_-]{11}$/.test(id||'')?id:null;
    }catch{return null;}
  }
  function directVideoUrl(raw){
    if(typeof raw!=='string'||raw.length>2048)return null;
    try{
      const u=new URL(raw.trim());
      return u.protocol==='https:'&&/\.(mp4|webm|ogg|m3u8)(?:$|[?#])/i.test(u.pathname+u.search)?u.href:null;
    }catch{return null;}
  }
  function isDirectVideo(value){return Boolean(directVideoUrl(value));}
  function youtubeEmbed(videoId,{start=0,end=0,autoplay=false}={}){
    const args=new URLSearchParams({playsinline:'1',controls:'0',rel:'0',modestbranding:'1',iv_load_policy:'3',fs:'0',disablekb:'1',start:String(start),autoplay:autoplay?'1':'0',mute:autoplay?'1':'0',enablejsapi:'1',origin:location.origin});
    if(end)args.set('end',String(end));
    return `https://www.youtube.com/embed/${videoId}?${args}`;
  }
  function destroyYouTubePlayer(){youtubeInstanceToken++;if(youtubePlayer){try{youtubePlayer.destroy();}catch{}youtubePlayer=null;}}
  function loadYouTubeApi(){
    if(window.YT?.Player)return Promise.resolve(window.YT);
    if(youtubeScriptPromise)return youtubeScriptPromise;
    youtubeScriptPromise=new Promise((resolve,reject)=>{
      const existing=window.onYouTubeIframeAPIReady;
      const timeout=setTimeout(()=>reject(Error('YouTube controls unavailable')),14000);
      window.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);try{existing?.();}catch{}resolve(window.YT);};
      const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.async=true;
      script.onerror=()=>{clearTimeout(timeout);reject(Error('YouTube player API failed to load'));};document.head.appendChild(script);
    }).catch(err=>{youtubeScriptPromise=null;throw err;});
    return youtubeScriptPromise;
  }
  function initSimulationPlayer(){
    const native=document.querySelector('#simulationVideo');
    if(native){
      youtubePlayer=native;
      native.addEventListener('loadedmetadata',()=>{native.currentTime=s.playheadMs/1000;void native.play().catch(()=>notice('Autoplay was blocked. Press PLAY to start the clip.'));},{once:true});
      native.addEventListener('play',()=>setReplayPlaying(true));
      native.addEventListener('pause',()=>setReplayPlaying(false));
      native.addEventListener('ended',()=>{s.playheadMs=s.replay?.run?.durationMs||0;setReplayPlaying(false);updateReplayFrame();});
      return;
    }
    const iframe=document.querySelector('#simulationYouTube');if(!iframe)return;
    const ticket=++youtubeInstanceToken;
    loadYouTubeApi().then(YT=>{
      if(s.page!=='viewer'||ticket!==youtubeInstanceToken||!iframe.isConnected)return;
      youtubePlayer=new YT.Player(iframe,{
        events:{
          onReady:e=>{
            if(ticket!==youtubeInstanceToken)return;
            // Autoplay muted is generally permitted; offer normal controls if blocked.
            try{e.target.mute();e.target.playVideo();}catch{}
          },
          onStateChange:e=>{
            if(ticket!==youtubeInstanceToken)return;
            const playing=e.data===YT.PlayerState.PLAYING;
            if(playing || e.data===YT.PlayerState.PAUSED || e.data===YT.PlayerState.ENDED){setReplayPlaying(playing);}
            if(e.data===YT.PlayerState.ENDED){s.playheadMs=s.replay?.run?.durationMs||0;updateReplayFrame();}
          },
          onAutoplayBlocked:()=>{if(ticket===youtubeInstanceToken)notice('Autoplay was blocked. Press play on the video to start the clip.');},
          onError:()=>{if(ticket===youtubeInstanceToken)notice('YouTube could not play this video here. Use OPEN ORIGINAL VIDEO below.');}
        }
      });
    }).catch(()=>{const feedback=document.querySelector('#playerFallback');if(feedback)feedback.textContent='YouTube controls are unavailable in this browser. Use the player controls or open the original video.';});
  }
  function toggleVideoPlayback(){
    if(youtubePlayer?.tagName==='VIDEO'){
      if(s.playheadMs >= (s.replay?.run?.durationMs||Infinity)){youtubePlayer.currentTime=0;s.playheadMs=0;}
      if(s.playing)youtubePlayer.pause();else void youtubePlayer.play();return;
    }
    if(!youtubePlayer||typeof youtubePlayer.playVideo!=='function'){
      notice('Use the controls inside the YouTube video until the player API is ready.');return;
    }
    try{
      if(s.playheadMs >= (s.replay?.run?.durationMs||Infinity)){youtubePlayer.seekTo(SIM_START_SECONDS,true);s.playheadMs=0;}
      if(s.playing)youtubePlayer.pauseVideo();else youtubePlayer.playVideo();
    }catch{notice('Use the controls inside the YouTube video.');}
  }
  const s = {
    page: 'games', gameId: 'fnaf-video', videoId: sessionStorage.getItem('ludus_youtube_id') || DEFAULT_VIDEO_URL, videoUrl: sessionStorage.getItem('ludus_youtube_url') || DEFAULT_VIDEO_URL, games: [], game: null, archetypes: [], archetypeId: sessionStorage.getItem('ludus_archetype') || 'first-time',
    session: null, replay: null, report: null, section: 'worked', runNumber: 1, playheadMs: 0, playing: false,
    lastFrameTime: 0, rate: 1, modal: false, message: '', error: null, busy: false, navToken: 0, gamePlaying: false
  };
  const esc = (value) => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const timeStr = (ms) => { const x = Math.max(0, Math.floor(ms/1000)); return `${String(Math.floor(x/60)).padStart(2,'0')}:${String(x%60).padStart(2,'0')}`; };
  const request = async (url, options={})=> { const res = await fetch(url,{...options,headers:{'Accept':'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});let body;try{body=await res.json();}catch{body={};}if(!res.ok)throw Error(body.error || `Request failed: ${res.status}`);return body; };
  // Route choreography: prefetch -> exit current content -> commit -> enter new content.
  // The shell and sidebar stay mounted throughout; this avoids the static snap caused by
  // wrapping an asynchronous loadRoute() inside document.startViewTransition().
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let navigationSequence = 0;
  let navigationBusy = false;
  let activeRouteAnimation = null;
  const routeStep = page => ({games:1,archetypes:2,viewer:3,report:4}[page] || 1);
  const isAnimated = () => !reducedMotion.matches && typeof Element !== 'undefined' &&
    typeof Element.prototype.animate === 'function';

  function cancelRouteAnimation() {
    if (activeRouteAnimation) {
      activeRouteAnimation.cancel();
      activeRouteAnimation = null;
    }
  }
  async function animateRouteStage(element, phase, direction) {
    if (!element || !isAnimated()) return;
    const distance = direction * 72;
    const exit = phase === 'exit';
    const frames = exit ? [
      {opacity:1, transform:'translate3d(0, 0, 0)', filter:'blur(0px)'},
      {opacity:0, transform:`translate3d(${-distance}px, -7px, 0)`, filter:'blur(5px)'}
    ] : [
      {opacity:0, transform:`translate3d(${distance}px, 12px, 0)`, filter:'blur(6px)'},
      {opacity:1, transform:'translate3d(0, 0, 0)', filter:'blur(0px)'}
    ];
    const animation = element.animate(frames, {
      duration:exit ? 290 : 570,
      easing:exit ? 'cubic-bezier(.55, 0, 1, .55)' : 'cubic-bezier(.17, 1, .3, 1)',
      fill:'both'
    });
    activeRouteAnimation = animation;
    if (exit) {
      try { await animation.finished; } catch { return; }
      element.style.opacity = '0';
    } else {
      // The entering animation supplies the starting opacity, so clear the old
      // held value immediately after starting it, with no single-frame flash.
      element.style.opacity = '';
      try { await animation.finished; } catch { return; }
    }
    if (activeRouteAnimation === animation) {
      animation.cancel();
      activeRouteAnimation = null;
    }
  }

  async function navigate(url, {replace=false, pop=false}={}) {
    if (!url || (navigationBusy && !pop)) return;
    const ticket = ++navigationSequence;
    navigationBusy = true;
    cancelRouteAnimation();
    const previousPage = s.page;
    const oldContent = document.querySelector('.main-content');
    oldContent?.style.setProperty('opacity','');
    document.querySelector('.shell')?.classList.add('is-navigating');
    document.querySelector('.main')?.setAttribute('aria-busy','true');
    if (!pop) {
      if (replace) history.replaceState({}, '', url);
      else history.pushState({}, '', url);
    }
    try {
      // Fetch while the old page is still visible. loadRoute provides a commit
      // callback instead of replacing its markup during the request.
      const commit = await loadRoute({deferRender:true});
      if (ticket !== navigationSequence) return;
      const direction = routeStep(s.page) < routeStep(previousPage) ? -1 : 1;
      await animateRouteStage(oldContent, 'exit', direction);
      if (ticket !== navigationSequence) return;
      destroyYouTubePlayer();
      s.playing = false;
      if (typeof commit === 'function') commit();
      window.scrollTo({top:0,behavior:'instant'});
      const fresh = document.querySelector('.main-content');
      await animateRouteStage(fresh, 'enter', direction);
      if (ticket !== navigationSequence) return;
    } finally {
      if (ticket === navigationSequence) {
        navigationBusy = false;
        document.querySelector('.shell')?.classList.remove('is-navigating');
        document.querySelector('.main')?.removeAttribute('aria-busy');
        document.querySelector('.main-content')?.style.removeProperty('opacity');
        cancelRouteAnimation();
      }
    }
  }
  function animateFeedback(kind='seek') {
    const board=document.querySelector('.simulation-board');
    if(!board || reducedMotion.matches) return;
    board.classList.remove('board-feedback');
    void board.offsetWidth;
    board.classList.add('board-feedback');
  }
  let feedbackTimer;
  function playbackFeedback(label) {
    if (reducedMotion.matches) return;
    const canvas=document.querySelector('.simulation-board');
    if(!canvas) return;
    let overlay=document.querySelector('#playbackFeedback');
    if(!overlay){ overlay=document.createElement('div');overlay.id='playbackFeedback';overlay.className='playback-feedback';overlay.setAttribute('aria-hidden','true');canvas.parentElement.appendChild(overlay); }
    overlay.textContent=label;
    overlay.classList.remove('shown');void overlay.offsetWidth;
    overlay.classList.add('shown');
    clearTimeout(feedbackTimer);
    feedbackTimer=setTimeout(()=>overlay?.classList.remove('shown'),560);
  }
  function setReplayPlaying(value) {
    s.playing=value;
    s.lastFrameTime=0;
    const btn=document.querySelector('#playPause');
    if(btn){btn.textContent=value?'❚❚ PAUSE':'▶ PLAY';btn.setAttribute('aria-pressed',String(value));}
    document.querySelector('.status')?.classList.toggle('is-playing',value);
  }
  function seekTo(ms,{feedback=true}={}) {
    if(!s.replay?.run)return;
    s.playheadMs=Math.max(0,Math.min(s.replay.run.durationMs,ms));
    if(youtubePlayer?.tagName==='VIDEO'){try{youtubePlayer.currentTime=s.playheadMs/1000;youtubePlayer.pause();}catch{}}
    else if(youtubePlayer?.seekTo){try{youtubePlayer.seekTo(SIM_START_SECONDS+s.playheadMs/1000,true);youtubePlayer.pauseVideo();}catch{}}
    setReplayPlaying(false);
    updateReplayFrame();
    if(feedback)animateFeedback();
  }
  const currentArch = () => s.archetypes.find(a=>a.id===s.archetypeId)||s.session?.archetype;
  function pathFor(step){if(step===1)return '/games';if(step===2)return '/archetypes';if(step===3&&s.session)return `/playtests/${s.session.id}/view`;if(step===4&&s.session)return `/playtests/${s.session.id}/report?section=worked`;return null;}
  function goto(url,replace=false){void navigate(url,{replace});}
  function notice(msg){s.message=msg;clearTimeout(toastTimer);document.querySelector('#toast')?.remove();const el=document.createElement('div');el.id='toast';el.className='toast-message';el.setAttribute('role','status');el.textContent=msg;document.body.append(el);toastTimer=setTimeout(()=>{el.classList.add('toast-out');setTimeout(()=>el.remove(),reducedMotion.matches?0:220);},3200);}
  function renderShell(main,step){
    const arch=currentArch();
    const sessionMarkup=s.session?'FNAF <span>/</span> 01 CLIP':s.videoId?'FNAF <span>/</span> VIDEO LINK':'NO GAME <span>/</span> CONNECT';
    const action =step===1?'CONTINUE':step===2?'START PLAYTEST':step===3?'VIEW REPORT':'VIEW SESSION';
    const enabled=step===1?!!s.videoId:step===2?!!s.archetypeId&&!!currentArch()?.fixtureAvailable&&!s.busy:!!s.session;
    const nextMarkup=`<div class="shell" data-screen="${esc(s.page)}">
      <main class="main"><div class="main-content">${main}</div></main>
      <aside class="sidebar" aria-label="Playtesting workflow">
       <div class="brand"><a href="/games" data-nav="/games" aria-label="LUDUS home"><img src="/assets/ludus-logo.png" alt="LUDUS" /></a><div class="brand-meta">PLAYTEST &nbsp;/&nbsp; OS</div></div>
       <div class="workflow"><div class="sidebar-section-label">WORKFLOW</div><nav class="flow-list" aria-label="Steps">${labels.map((l,i)=>{const url=pathFor(i+1);return `<button class="flow-item ${step===i+1?'active':''}" ${step===i+1?'aria-current="step"':''} data-step="${i+1}" ${!url?'disabled':''}>${String(i+1).padStart(2,'0')} &nbsp; ${l}</button>`}).join('')}</nav></div>
       <div class="side-session"><div class="sidebar-section-label">CURRENT SESSION</div><div class="session-line">${sessionMarkup}</div>${s.session?`<div class="sub-session">${esc(s.session.archetype?.name??arch?.name??'FIRST-TIME PLAYER')} &nbsp; / &nbsp; DEMO</div>`:''}</div>
       <div class="side-spacer"></div><div class="side-links"><button class="side-small" data-action="history">PAST SESSIONS ↗</button><button class="side-small" data-action="about">ABOUT DEMO</button></div>
       <button class="side-primary" data-action="primary" ${!enabled?'disabled':''}><span>${action}</span><span>↗</span></button>
      </aside></div>${s.modal?renderHistoryModal():''}`;
    const existingShell=$app.querySelector('.shell');
    if (!existingShell) { $app.innerHTML=nextMarkup; return; }

    // Retain the main-content wrapper, sidebar, logo and textured backdrop.
    // Recreating those nodes on each route caused visible flashing and snapping.
    const template=document.createElement('template');
    template.innerHTML=nextMarkup;
    const incoming=template.content.querySelector('.shell');
    existingShell.dataset.screen=s.page;
    const currentMain=existingShell.querySelector('.main-content');
    currentMain.innerHTML=incoming.querySelector('.main-content').innerHTML;
    const currentAside=existingShell.querySelector('.sidebar');
    const nextAside=incoming.querySelector('.sidebar');
    const navCurrent=[...currentAside.querySelectorAll('.flow-item')];
    const navNext=[...nextAside.querySelectorAll('.flow-item')];
    navCurrent.forEach((node,i)=>{
      const updated=navNext[i]; if(!updated)return;
      node.disabled=updated.disabled;
      node.classList.toggle('active',updated.classList.contains('active'));
      if(updated.hasAttribute('aria-current'))node.setAttribute('aria-current','step');
      else node.removeAttribute('aria-current');
    });
    currentAside.querySelector('.side-session').innerHTML=nextAside.querySelector('.side-session').innerHTML;
    const primary=currentAside.querySelector('.side-primary');
    const nextPrimary=nextAside.querySelector('.side-primary');
    primary.innerHTML=nextPrimary.innerHTML;
    primary.disabled=nextPrimary.disabled;
    // Remove the previous route's modal if a new page was selected.
    const existingModal=document.querySelector('#modal');
    existingModal?.remove();
    if(s.modal && template.content.querySelector('#modal'))$app.appendChild(template.content.querySelector('#modal'));
  }
  function header(title,subtitle,extras=''){return `<header class="head"><h1>${esc(title)}</h1><div class="head-row"><div class="head-sub">${esc(subtitle)}</div>${extras}</div></header>`;}
  function renderGame(){
    const mediaUrl=isDirectVideo(s.videoUrl);
    const valid=Boolean(s.videoId)&&Boolean(s.videoUrl);
    const preview=valid?(mediaUrl?`<video id="previewVideo" class="native-video" src="${esc(s.videoUrl)}" autoplay muted playsinline preload="auto"></video>`:`<iframe id="previewYouTube" title="Connected Five Nights at Freddy's human gameplay video preview" src="${esc(youtubeEmbed(s.videoId,{start:0,end:75,autoplay:true}))}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>` )
      :'<div class="video-empty">PASTE A YOUTUBE VIDEO LINK ABOVE TO CONNECT YOUR GAME</div>';
    const body=header('Connect your game','Paste your game link to create a game connection.')+`
      <form id="connectVideoForm" class="connect-video-form" aria-label="Connect a gameplay video">
        <label for="gameUrlInput">GAME URL &nbsp; / &nbsp; ITCH, GITHUB, OR DIRECT LINK</label>
        <div class="connect-video-controls"><input id="gameUrlInput" type="url" name="gameUrl" placeholder="https://.../video.mp4" value="${esc(s.videoUrl)}" autocomplete="url" required />
        <button type="submit" class="connect-video-button">CONNECT ↗</button></div>
        <div id="connectFeedback" class="connect-feedback" role="status">${valid?'● GAME CONNECTED':'ENTER A VALID GAME LINK TO CONTINUE'}</div>
      </form>
      <section class="preview-card" aria-label="Connected game footage"><div class="game-viewport youtube-viewport">${preview}</div>
      <div class="preview-meta"><div class="game-title">FIVE NIGHTS AT FREDDY'S <span>&nbsp;/&nbsp; GAMEPLAY VIDEO</span></div>
      <div class="game-controls"><a class="link-line" href="${esc(s.videoUrl)}" target="_blank" rel="noopener noreferrer">OPEN ORIGINAL VIDEO ↗</a><span class="demo-caption">RECORDED HUMAN GAMEPLAY &nbsp; / &nbsp; NOT AI</span></div></div></section>`;
    renderShell(body,1);
  }
  function renderArchetypes(){
    const body=header('Choose an archetype','One player behavior model, six ways to play.')+
      `<section class="archetype-grid" role="radiogroup" aria-label="Choose an archetype">${s.archetypes.map((a,i)=>`<button type="button" style="--order:${i}" class="archetype-card ${s.archetypeId===a.id?'active':''}" role="radio" aria-checked="${s.archetypeId===a.id}" data-arch="${esc(a.id)}" ${a.fixtureAvailable?'':'disabled aria-label="Demo not yet available"'}><div class="card-num">${esc(a.number)} / 06 ${a.fixtureAvailable?'':'/ SOON'}</div><div class="card-title">${esc(a.name)}</div><div class="card-desc">${esc(a.description)}</div></button>`).join('')}</section><div class="selection-footer">SELECTED &nbsp;/&nbsp; <span id="selectedArchetype">${esc(currentArch()?.name || 'NONE')}</span> &nbsp; / &nbsp; SAME HUMAN FOOTAGE FOR ALL ARCHETYPES</div>`;
    renderShell(body,2);
  }
  function renderViewer(){
    const r=s.replay?.run,duration=r?.durationMs||165000;
    const progress=Math.max(0,Math.min(100,s.playheadMs/duration*100));
    const currentEvent=r?.events?.filter(e=>e.timestampMs<=s.playheadMs).at(-1);
    const clipStart=r?.startSeconds??SIM_START_SECONDS;
    const clipEnd=r?.endSeconds??SIM_END_SECONDS;
    const videoId=r?.videoId||s.session?.video_id||DEMO_VIDEO_ID;
    const mediaUrl=SIMULATION_VIDEO_URL;
    const subtitle=`${(s.session?.archetype?.name||'First-time player').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())}  /  FNAF  /  human footage demo`;
    const embed=youtubeEmbed(videoId,{start:clipStart+Math.floor(s.playheadMs/1000),end:clipEnd,autoplay:true});
    const media=`${mediaUrl?`<video id="simulationVideo" class="simulation-board native-video" src="${esc(mediaUrl)}" autoplay muted playsinline preload="auto"></video>`:`<iframe id="simulationYouTube" class="simulation-board youtube-player" title="Markiplier playing Five Nights at Freddy's, sample video clip (not an AI agent)" src="${esc(embed)}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`}`;
    const body=header('Simulation preview',subtitle)+`
      <section aria-label="Human recorded gameplay, illustrative simulated playtest">
      <div class="sim-header"><div class="status"><span class="status-dot"></span> HUMAN FOOTAGE &nbsp; / &nbsp; DEMO REPLAY</div><div class="sim-run-info">CLIP 01 / 01 &nbsp; · &nbsp; <span id="viewerTime">${timeStr(s.playheadMs)}</span> / ${timeStr(duration)}</div></div>
      <div class="replay-stage">${media}</div>
      <div class="transport"><button data-action="jump-prev" title="Go to previous marker" aria-label="Previous demonstration marker">◀◀</button><button class="playpause" data-action="playpause" id="playPause" aria-pressed="false">▶ PLAY</button><button data-action="jump-next" title="Next demonstration marker" aria-label="Next demonstration marker">▶▶</button><div class="right-transport"><span>EXCERPT ${timeStr(clipStart*1000)}–${timeStr(clipEnd*1000)}</span><label for="speedSelect">SPEED</label><select id="speedSelect" aria-label="Replay speed"><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option></select></div></div>
      <div class="progress" id="progressBar"><div class="progress-fill" id="progressFill" style="width:${progress}%"></div><input type="range" aria-label="Scrub demonstration excerpt" min="0" max="${duration}" step="1000" value="${Math.min(s.playheadMs,duration)}" id="playhead" /></div>
      <div class="timeline-markers">${(r?.events||[]).map(e=>`<button data-time="${e.timestampMs}" title="Illustrative marker at ${timeStr(e.timestampMs)}" style="left:${e.timestampMs/duration*100}%" aria-label="Jump to example marker at ${timeStr(e.timestampMs)}"></button>`).join('')}</div>
      <div class="current-event" id="eventLabel">DEMO ANNOTATION &nbsp;/&nbsp; <strong>${esc(currentEvent?.label||'NO EVENT SELECTED')}</strong></div>
      <div class="demo-caption" id="playerFallback">SOURCE: RECORDED HUMAN GAMEPLAY &nbsp; · &nbsp; MARKERS AND REPORT ARE ILLUSTRATIVE. <a target="_blank" rel="noopener noreferrer" href="${esc(mediaUrl||'https://www.youtube.com/watch?v='+videoId)}">OPEN ORIGINAL GAME ↗</a></div>
      </section>`;
    renderShell(body,3);updateReplayFrame();initSimulationPlayer();
  }
  function renderReport(){
    const section=s.report?.sections?.[s.section]||s.report?.sections?.worked;
    if(!section){renderError('Report unavailable','This session does not have a prepared demonstration report.');return;}
    const nav=[['worked','WHAT WORKED'],['broke','WHERE IT BROKE'],['improve','TO IMPROVE']];
    const body=header(section.title,section.subtitle)+`<div class="report-content">
      <nav class="section-nav" aria-label="Report sections">${nav.map(([id,l])=>`<button data-section="${id}" class="${id===s.section?'active':''}" ${id===s.section?'aria-current="page"':''}>${l}</button>`).join('')}<div class="spacer"></div><div class="demo-label">PREPARED DEMO</div></nav>
      <div class="report-table">${section.findings.map((f,i)=>`<div class="report-row" style="--order:${i}"><div class="report-index">${esc(f.number)} / ${esc(f.label)}</div><div class="report-description">${esc(f.description)}</div>${f.evidence?`<button class="report-replay" data-evidence="${esc(f.evidence.runId)}:${f.evidence.timestampMs}" title="Open illustrative video timestamp, not verified evidence">CLIP &nbsp; ↗</button>`:'<span class="report-index">NO REPLAY</span>'}</div>`).join('')}</div>
      <div class="report-bottom">ILLUSTRATIVE DEMO FINDINGS &nbsp; / &nbsp; HUMAN FOOTAGE &nbsp; / &nbsp; NOT VERIFIED ANALYSIS</div>
    </div>`;
    renderShell(body,4);
  }
  function renderError(title,description){renderShell(`<div class="problem"><h2>${esc(title)}</h2><p>${esc(description)}</p><button class="button-action" data-action="home">RETURN TO GAME ↗</button></div>`,1);}
  function renderHistoryModal(){return `<div class="overlay" id="modal" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-label="Past playtest sessions" onclick="event.stopPropagation()"><div class="modal-head"><span>PAST SESSIONS</span><button data-action="close-modal" aria-label="Close history">×</button></div><div class="modal-status" id="historyContent">LOADING SESSIONS...</div></div></div>`;}
  function updateReplayFrame(){
    const r=s.replay?.run;if(!r)return;
    const t=document.querySelector('#viewerTime');if(t)t.textContent=timeStr(s.playheadMs);
    const f=document.querySelector('#progressFill');if(f)f.style.width=`${(s.playheadMs/r.durationMs*100).toFixed(2)}%`;
    const input=document.querySelector('#playhead');if(input)input.value=String(Math.round(s.playheadMs));
    const cur=r.events.filter(e=>e.timestampMs<=s.playheadMs).at(-1);
    const ev=document.querySelector('#eventLabel'), eventKey=cur?.timestampMs??'initial';
    if(ev&&ev.dataset.eventKey!==String(eventKey)){
      ev.dataset.eventKey=String(eventKey);
      ev.innerHTML=`DEMO ANNOTATION &nbsp;/&nbsp; <strong>${esc(cur?.label||'NO EVENT SELECTED')}</strong>`;
      if(ev.dataset.hasPlayed&&!reducedMotion.matches){ev.classList.remove('event-updated');void ev.offsetWidth;ev.classList.add('event-updated');}
      ev.dataset.hasPlayed='yes';
    }
    document.querySelectorAll('.timeline-markers button').forEach(marker=>marker.classList.toggle('passed',Number(marker.dataset.time)<=s.playheadMs));
  }
  function connectVideo(){
    const input=document.querySelector('#gameUrlInput');const raw=input?.value?.trim()||'';const id=youtubeId(raw);
    const direct=directVideoUrl(raw);
    if(!id&&!direct){const fb=document.querySelector('#connectFeedback');if(fb){fb.textContent='INVALID LINK: ENTER A YOUTUBE LINK OR DIRECT MP4/WEBM/HLS URL';fb.classList.add('invalid');}input?.setAttribute('aria-invalid','true');input?.focus();return;}
    s.videoId=id||direct;s.videoUrl=id?`https://www.youtube.com/watch?v=${id}`:direct;
    sessionStorage.setItem('ludus_youtube_id',s.videoId);sessionStorage.setItem('ludus_youtube_url',s.videoUrl);
    input?.removeAttribute('aria-invalid');renderGame();notice('Gameplay video connected. Select an archetype to continue.');
  }
  document.addEventListener('submit',e=>{if(e.target.id==='connectVideoForm'){e.preventDefault();connectVideo();}});
  async function createPlaytest(){
    if(s.busy)return;s.busy=true;const btn=document.querySelector('.side-primary');if(btn){btn.disabled=true;btn.classList.add('is-busy');btn.firstElementChild.textContent='CREATING SESSION...';}
    try{const data=await request(`${API}/playtests`,{method:'POST',body:JSON.stringify({gameId:s.gameId,gameUrl:s.videoUrl,archetypeId:s.archetypeId,runCount:1,mode:'demo'})});
      goto(`/playtests/${encodeURIComponent(data.sessionId)}/view`);
    }catch(e){s.busy=false;renderArchetypes();notice(`Session could not be created: ${e.message}`);}
  }
  async function loadRoute({deferRender=false}={}){
    const commit=fn=>deferRender?fn:fn();
    const token=++routeVersion;
    s.playing=false;s.lastFrameTime=0;s.error=null;s.busy=false;
    const pathname=location.pathname,query=new URLSearchParams(location.search);
    const match=pathname.match(/^\/playtests\/([a-f0-9-]+)\/(view|report)$/i);
    try{
      if(pathname==='/games'||pathname==='/'){
        s.page='games';s.session=null;s.replay=null;s.report=null;
        const data=await request(`${API}/games`);if(token!==routeVersion)return;
        s.games=data.games;s.game=data.games.find(g=>g.id===s.gameId)||data.games[0];s.gameId=s.game?.id;return commit(()=>renderGame());
      }
      if(pathname==='/archetypes'){
        s.page='archetypes';const data=await request(`${API}/archetypes?gameId=${encodeURIComponent(s.gameId)}`);if(token!==routeVersion)return;
        s.archetypes=data.archetypes;if(!s.archetypes.some(a=>a.id===s.archetypeId&&a.fixtureAvailable))s.archetypeId=s.archetypes.find(a=>a.fixtureAvailable)?.id||'';
        return commit(()=>renderArchetypes());
      }
      if(match){
        s.page=match[2]==='view'?'viewer':'report';const data=await request(`${API}/playtests/${match[1]}`);if(token!==routeVersion)return;
        s.session=data.session;s.archetypeId=s.session.archetype_id;s.gameId=s.session.game_id;s.videoId=s.session.video_id||DEMO_VIDEO_ID;s.videoUrl=isDirectVideo(s.videoId)?s.videoId:'https://www.youtube.com/watch?v='+s.videoId;
        if(s.page==='viewer'){
          let rNum=1;
          s.runNumber=rNum;const replayData=await request(`${API}/playtests/${match[1]}/replay?run=${rNum}`);if(token!==routeVersion)return;
          s.replay=replayData;s.playheadMs=Math.max(0,Math.min(Number(query.get('t'))||0,replayData.run.durationMs));return commit(()=>renderViewer());
        }
        s.section=['worked','broke','improve'].includes(query.get('section'))?query.get('section'):'worked';const reportData=await request(`${API}/playtests/${match[1]}/report`);if(token!==routeVersion)return;
        s.report=reportData.report;return commit(()=>renderReport());
      }
      history.replaceState({},'', '/games');
      return loadRoute({deferRender});
    }catch(e){if(token!==routeVersion)return;s.error=e.message;return commit(()=>renderError('Unable to open this screen',e.message));}
  }
  function loadRun(run){if(!s.session)return;goto(`/playtests/${s.session.id}/view?run=${run}`,true);}
  function updateReportSection(id){if(id===s.section||!s.session)return;goto(`/playtests/${s.session.id}/report?section=${id}`);}
  function replayEvidence(value){if(!s.session)return;const [runId,t]=value.split(':');const n=Number(runId.replace('run-',''));goto(`/playtests/${s.session.id}/view?run=${n}&t=${Number(t)}`);}
  async function showHistory(){s.modal=true;$app.insertAdjacentHTML('beforeend',renderHistoryModal());try{const data=await request(`${API}/playtests`);const el=document.querySelector('#historyContent');if(!el)return;el.innerHTML=data.sessions.length?`<div class="session-history">${data.sessions.map((ss,i)=>`<button style="--order:${i}" data-open-session="${esc(ss.id)}"><span>${esc(ss.game_id.toUpperCase())} / ${esc(ss.archetype_id.toUpperCase().replaceAll('-',' '))}<br><span style="color:#8e9792;font-size:10px">${esc(new Date(ss.created_at).toLocaleString())} &nbsp; · &nbsp; DEMO</span></span><span>↗</span></button>`).join('')}</div>`:'<p class="empty">No saved sessions yet. Create one from the archetype screen.</p>';}catch(e){const el=document.querySelector('#historyContent');if(el)el.textContent=e.message;}}
  document.addEventListener('click',async e=>{
    const nav=e.target.closest('[data-nav]');if(nav){e.preventDefault();goto(nav.dataset.nav);return;}
    const button=e.target.closest('[data-arch],[data-step],[data-section],[data-evidence],[data-time],[data-open-session],[data-action]');if(!button)return;
    if(button.dataset.arch){
      if(button.disabled || s.archetypeId===button.dataset.arch)return;
      s.archetypeId=button.dataset.arch;sessionStorage.setItem('ludus_archetype',s.archetypeId);
      document.querySelectorAll('.archetype-card').forEach(card=>{
        const active=card.dataset.arch===s.archetypeId;
        card.classList.toggle('active',active);
        card.setAttribute('aria-checked',String(active));
        if(active){card.classList.remove('card-selected');void card.offsetWidth;card.classList.add('card-selected');}
      });
      const selected=document.querySelector('#selectedArchetype');
      if(selected){selected.textContent=currentArch()?.name||'NONE';selected.classList.remove('selection-changed');void selected.offsetWidth;selected.classList.add('selection-changed');}
      return;
    }
    if(button.dataset.step){const dest=pathFor(Number(button.dataset.step));if(dest)goto(dest);return;}
    if(button.dataset.section){updateReportSection(button.dataset.section);return;}
    if(button.dataset.evidence){replayEvidence(button.dataset.evidence);return;}
    if(button.dataset.time){seekTo(Number(button.dataset.time));return;}
    if(button.dataset.openSession){s.modal=false;goto(`/playtests/${button.dataset.openSession}/report?section=worked`);return;}
    switch(button.dataset.action){
      case 'primary': if(s.page==='games')goto('/archetypes');else if(s.page==='archetypes')await createPlaytest();else if(s.page==='viewer')goto(`/playtests/${s.session.id}/report?section=worked`);else if(s.page==='report')goto(`/playtests/${s.session.id}/view?run=1`);break;
      case 'home':goto('/games');break;
      case 'open-game':document.querySelector('#gameUrlInput')?.focus();break;
      case 'playpause':if(s.replay)toggleVideoPlayback();break;
      case 'jump-prev':case 'jump-next':{
        const events=s.replay?.run?.events?.map(v=>v.timestampMs).sort((a,b)=>a-b)||[];
        let target=button.dataset.action==='jump-next'?events.find(ms=>ms>s.playheadMs+100):events.filter(ms=>ms<s.playheadMs-100).at(-1);
        seekTo(target??(button.dataset.action==='jump-next'?s.replay?.run.durationMs||0:0));break;}
      case 'history':await showHistory();break;
      case 'close-modal':document.querySelector('#modal')?.remove();s.modal=false;break;
      case 'about':notice('LUDUS demo: YouTube human gameplay clip + sample report. No trained AI agent or archetype simulation is running.');break;
    }
  });
  document.addEventListener('change',e=>{if(e.target.id==='speedSelect'){s.rate=Number(e.target.value);try{if(youtubePlayer?.tagName==='VIDEO')youtubePlayer.playbackRate=s.rate;else youtubePlayer?.setPlaybackRate(s.rate);}catch{}}});
  document.addEventListener('input',e=>{if(e.target.id==='playhead'&&s.replay)seekTo(Number(e.target.value),{feedback:false});});
  // Small tactile response on controls. The ripple is clipped and never changes the layout.
  document.addEventListener('pointerdown',e=>{
    if(reducedMotion.matches)return;
    const button=e.target.closest('.archetype-card,.flow-item,.side-primary,.section-nav button,.transport button,.report-replay');
    if(!button || button.disabled)return;
    const rect=button.getBoundingClientRect(),ink=document.createElement('span');
    ink.className='press-ink';
    ink.style.left=`${e.clientX-rect.left}px`;ink.style.top=`${e.clientY-rect.top}px`;
    button.appendChild(ink);ink.addEventListener('animationend',()=>ink.remove(),{once:true});
  });
  document.addEventListener('pointermove',e=>{
    const card=e.target.closest('.archetype-card');
    if(!card || reducedMotion.matches)return;
    const rect=card.getBoundingClientRect();
    card.style.setProperty('--mx',`${e.clientX-rect.left}px`);
    card.style.setProperty('--my',`${e.clientY-rect.top}px`);
  });
  // Replay-only keyboard shortcuts; no interference with selects, inputs or the playable game.
  document.addEventListener('keydown',e=>{
    if(s.page!=='viewer'||!s.replay || e.altKey || e.ctrlKey || e.metaKey)return;
    if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName))return;
    if(e.key===' '){e.preventDefault();toggleVideoPlayback();}
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();seekTo(s.playheadMs+(e.key==='ArrowRight'?5000:-5000));}
  });
  window.addEventListener('popstate',()=>{void navigate(location.href,{pop:true});});
  function animationFrame(ts){
    if(s.page==='viewer'&&s.replay?.run&&youtubePlayer){
      try{
        const ytTime=youtubePlayer.tagName==='VIDEO'
          ? youtubePlayer.currentTime
          : youtubePlayer.getCurrentTime();
        if(Number.isFinite(ytTime)&&ytTime>0){
          const mediaStart=youtubePlayer.tagName==='VIDEO'?0:SIM_START_SECONDS;
          s.playheadMs=Math.min(s.replay.run.durationMs,Math.max(0,(ytTime-mediaStart)*1000));
          updateReplayFrame();
          if(s.playheadMs>=s.replay.run.durationMs){
            if(youtubePlayer.tagName==='VIDEO')youtubePlayer.pause();else youtubePlayer.pauseVideo();
            setReplayPlaying(false);
          }
        }
      }catch{}
    }
    requestAnimationFrame(animationFrame);
  }
  requestAnimationFrame(animationFrame);
  void loadRoute();
})();
