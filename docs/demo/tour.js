/* Narrative navigation through evidence, amendment, eligibility, and decision. */
(() => {
 'use strict';
 const steps=[
  {eyebrow:'01 / THE CASE',title:'A deadline changes. The record remembers.',copy:'This fictional workforce opportunity includes a base solicitation and an amendment. The latest proposed deadline is December 3, 2027, at 3 p.m. New York time. The original November 20 date remains accessible.',caseId:3,tab:'revisions'},
  {eyebrow:'02 / THE EVIDENCE',title:'Two documents. One deliberate choice.',copy:'Open the deadline field. Inspect the exact PDF source, then choose whether to confirm the amended proposal or keep the earlier cited source. Nothing is silently approved.',caseId:3,tab:'intake',field:'submission_deadline'},
  {eyebrow:'03 / THE UNKNOWN',title:'Silence is not permission.',copy:'This scanned housing solicitation requires a credential absent from Harbor’s synthetic organization profile. The requirement remains UNKNOWN, not PASS.',caseId:2,tab:'eligibility'},
  {eyebrow:'04 / THE DECISION',title:'The last word belongs to a person.',copy:'Switch to the simulated director role to record a pursue, decline, or discussion decision with a rationale. Your choices remain in this browser; the downloadable packet clearly labels what was verified.',caseId:2,tab:'eligibility',director:true}
 ];
 let index=0,returnFocus=null;
 function renderStep(){
  const s=steps[index];S.selectedId=s.caseId;S.tab=s.tab;S.evidenceCandidateId=null;S.fieldQuery='';S.fieldFilter='all';if(s.field)S.fieldKey=s.field;
  // A simulated actor is not a security identity. Only the local backend has true authentication.
  if(s.director&&S.session.actor!=='harbor-director'){
   window.HarborlineStatic.api('/api/session',{method:'POST',body:JSON.stringify({actor:'harbor-director'})}).then(async()=>{
    S.session=await window.HarborlineStatic.api('/api/session');$('#actor-select').value=S.session.actor;await loadList(s.caseId);draw();
   });return;
  }
  loadList(s.caseId).then(draw);
 }
 function draw(){const s=steps[index];
  document.querySelector('#tour-root').innerHTML=`<div class="tour-shade"><div class="tour-panel" role="dialog" aria-modal="true" aria-labelledby="tour-heading" aria-describedby="tour-copy"><div class="tour-top"><span class="tour-index">THE HARBORLINE FIELD GUIDE · ${String(index+1).padStart(2,'0')} / 04</span><button type="button" id="tour-close" aria-label="Close guided tour">×</button></div><div class="tour-progress" aria-hidden="true">${steps.map((_,i)=>`<i class="${i<=index?'done':''}"></i>`).join('')}</div><div class="tour-body"><span class="tour-kicker">${s.eyebrow}</span><h2 id="tour-heading">${s.title}</h2><p id="tour-copy">${s.copy}</p></div><div class="tour-actions">${index?'<button type="button" class="tour-secondary" id="tour-back">← Previous</button>':'<span class="tour-hint">A four-stop guided journey</span>'}<button type="button" class="tour-next" id="tour-next">${index===steps.length-1?'Explore on my own ↗':'Continue the tour →'}</button></div></div></div>`;
  $('#tour-next')?.focus();
 }
 function close(){const root=document.querySelector('#tour-root');if(root)root.innerHTML='';returnFocus?.focus();}
 function start(){returnFocus=document.activeElement;index=0;renderStep();}
 document.addEventListener('click',e=>{
  if(e.target.closest('#tour-close')){close();return;}
  if(e.target.closest('#tour-back')){index=Math.max(index-1,0);renderStep();return;}
  if(e.target.closest('#tour-next')){if(index===steps.length-1){close();return;}index++;renderStep();return;}
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.querySelector('#tour-root')?.innerHTML){e.preventDefault();close();}});
 window.HarborlineTour={start};
})();
