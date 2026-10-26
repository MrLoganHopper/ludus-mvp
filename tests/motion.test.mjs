import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const js=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const css=await readFile(new URL('../public/app.css',import.meta.url),'utf8');

test('all interactive pages still expose game, archetype, replay and report actions',()=>{
  for(const selector of ['archetype-card','side-primary','simulationYouTube','playPause','playhead','report-row','report-replay','data-evidence']) {
    assert.ok(js.includes(selector),`Missing ${selector}`);
  }
  assert.match(js,/function setReplayPlaying\(/);
  assert.match(js,/autoplay:true/);
  assert.match(js,/SIM_START_SECONDS=240, SIM_END_SECONDS=405/);
  assert.match(js,/id="connectVideoForm"/);
  assert.match(js,/function seekTo\(/);
  assert.match(js,/if\(id===s.section\|\|!s.session\)return/);
});

test('route changes explicitly await content exit before committing and entering next page',()=>{
  const navStart=js.indexOf('async function navigate(');
  const navEnd=js.indexOf('function animateFeedback(', navStart);
  const navigation=js.slice(navStart,navEnd);
  const milestones=[
    'await loadRoute({deferRender:true})',
    "await animateRouteStage(oldContent, 'exit', direction)",
    "commit()",
    "await animateRouteStage(fresh, 'enter', direction)"
  ];
  let last=-1;
  for(const fragment of milestones){
    const idx=navigation.indexOf(fragment);
    assert.ok(idx>last,`Navigation phase missing or out of order: ${fragment}`);
    last=idx;
  }
  assert.match(js,/function renderShell\(main,step\)/);
  assert.match(js,/currentMain\.innerHTML=incoming\.querySelector\('\.main-content'\)\.innerHTML/);
  assert.match(js,/currentAside\.querySelector\('\.side-session'\)\.innerHTML/);
  assert.ok(!js.includes('document.startViewTransition(callback)'), 'Old premature transition should be removed');
});

test('page transitions use distinct visible exit and enter motion, with accessibility fallback',()=>{
  assert.match(js,/duration:exit \? 290 : 570/);
  assert.match(js,/translate3d\(\$\{distance\}px, 12px, 0\)/);
  assert.match(js,/filter:'blur\(6px\)'/);
  assert.match(js,/prefers-reduced-motion: reduce/);
  assert.match(js,/typeof Element\.prototype\.animate === 'function'/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/animation:none!important/);
  assert.match(css,/\.shell\.is-navigating \.main-content/);
});

test('next button, sidebar, report sections, browser back all go through navigation pipeline',()=>{
  assert.match(js,/case 'primary': if\(s.page==='games'\)goto\('\/archetypes'\)/);
  assert.match(js,/function updateReportSection\(id\).*goto\(`/);
  assert.match(js,/if\(button\.dataset\.step\).*goto\(dest\)/);
  assert.match(js,/window\.addEventListener\('popstate',\(\)=>\{void navigate\(location\.href,\{pop:true\}\);\}\)/);
});
