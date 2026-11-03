/* Public, synthetic-only static adapter. Never sends reviews to a server. */
(() => {
 'use strict';
 const KEY='harborline-static-demo-v07';
 const ACTORS={'harbor-analyst':{role:'analyst',organization:'harbor-demo'},'harbor-director':{role:'director',organization:'harbor-demo'},'other-analyst':{role:'analyst',organization:'other-demo'}};
 let dataset, store, actor='harbor-analyst';
 const clone=x=>structuredClone(x);
 const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 function error(message,status=400){const e=new Error(message);e.status=status;throw e}
 function persist(){try{localStorage.setItem(KEY,JSON.stringify({schema:1,details:store.details,profile:store.profile,actor}));}catch{/* private browsing may deny localStorage; session remains usable */}}
 function ensureVisible(id){if(ACTORS[actor]?.organization!=='harbor-demo')error('Opportunity not found in this organization',404);const d=store.details.find(x=>x.opportunity.id===id);if(!d)error('Opportunity not found',404);return d;}
 function audit(d,event_type,payload={}){d.audit.unshift({actor,event_type,payload_json:JSON.stringify(payload),created_at:new Date().toISOString().replace('T',' ').slice(0,19)});d.audit=d.audit.slice(0,30)}
 async function ready(){if(!dataset){const response=await fetch('./demo/demo-data.json',{cache:'no-store'});if(!response.ok)error('Synthetic demo package not found',503);dataset=await response.json();if(dataset.mode!=='synthetic-static-demo'||dataset.schema!==1)error('Invalid synthetic demo package');let saved=null;try{saved=JSON.parse(localStorage.getItem(KEY)||'null')}catch{};if(saved?.schema===1&&Array.isArray(saved.details)&&saved.details.length===3){store={details:saved.details,profile:saved.profile};actor=ACTORS[saved.actor]?saved.actor:actor;}else store={details:clone(dataset.details),profile:clone(dataset.profile)};}return store;}
 const deadlineSummary=d=>{
  const f=d.fields.find(x=>x.key==='submission_deadline');return f?.current||'Not supplied';
 };
 function makePacket(d){
  const critical=['submission_deadline','eligible_applicants','geography','required_registrations','mandatory_attachments','match_requirement'];
  const reviewed=d.fields.filter(f=>['confirmed','edited'].includes(f.status)).length;
  const openIssues=d.fields.filter(f=>critical.includes(f.key)&&!['confirmed','edited'].includes(f.status)).map(f=>({field:f.key,label:f.label,status:f.status,reason:f.proposed?'Source proposal requires human review':'No supported source value'}));
  const unknownCriteria=d.eligibility.filter(e=>e.status!=='pass').map(e=>({field:e.field_key,assessment:e.status,requirement:e.requirement,explanation:e.explanation}));
  return {kind:'director_review_packet',mode:'browser-only-synthetic-demo',generatedAt:new Date().toISOString(),opportunity:d.opportunity,profileVersion:d.profile?.version,readiness:{reviewed,total:d.fields.length,openIssues,unknownCriteria,message:openIssues.length||unknownCriteria.length?'Discussion required: unresolved requirements remain':'Critical fields reviewed; human judgment still required'},revisions:d.fields.filter(f=>f.conflicts.length).map(f=>({field:f.key,label:f.label,currentStatus:f.status,currentValue:f.current,reviewedEvidence:f.currentCitation,proposedValue:f.proposed,proposedEvidence:f.citation,alternatives:f.candidates})),fields:d.fields.map(f=>({key:f.key,label:f.label,status:f.status,acceptedOrDisplayedValue:f.current,source:f.valueOrigin==='confirmed_source'?f.currentCitation:null,proposedSource:f.citation,manuallySupplied:f.valueOrigin==='manual',needsRereview:!!f.review?.needsRereview})),deadlines:d.deadlines,eligibility:d.eligibility,decisions:d.decisions,documents:d.documents};
 }
 async function api(path,options={}){
  await ready();const method=(options.method||'GET').toUpperCase();let body={};if(options.body){try{body=JSON.parse(options.body)}catch{error('Invalid request data')}}
  if(path==='/api/session'){
   if(method==='GET')return {actor,role:ACTORS[actor].role,organization:ACTORS[actor].organization,demo:true};
   if(method==='POST'){if(!ACTORS[body.actor])error('Unknown simulated role');actor=body.actor;persist();return {actor,role:ACTORS[actor].role};}
  }
  if(path==='/api/opportunities'&&method==='GET')return {opportunities:ACTORS[actor].organization==='harbor-demo'?store.details.map(d=>({...d.opportunity,document_count:d.documents.length,decision:d.decisions[0]?.decision??null})):[],profile:ACTORS[actor].organization==='harbor-demo'?clone(store.profile):null};
  if(path==='/api/reset-demo'&&method==='POST'){store={details:clone(dataset.details),profile:clone(dataset.profile)};actor='harbor-analyst';persist();return {reset:true}}
  if(path==='/api/profile'&&method==='PUT'){
   if(ACTORS[actor].organization!=='harbor-demo')error('Profile unavailable',403);
   if(!Array.isArray(body.credentials)||!Array.isArray(body.negative_evidence))error('Invalid profile');
   const previous=store.profile;
   store.profile={...previous,version:previous.version+1,mission:String(body.mission||'').slice(0,1500),geography:String(body.geography||'').slice(0,300),credentials:body.credentials.map(x=>String(x).slice(0,200)).slice(0,30),negative_evidence:body.negative_evidence.map(x=>String(x).slice(0,200)).slice(0,30),notes:String(body.notes||'').slice(0,1200)};
   for(const d of store.details){d.profile=clone(store.profile);for(const e of d.eligibility){e.status='unknown';e.org_profile_version_id=null;e.org_evidence='Browser-only profile change — not re-verified';e.explanation='An edited browser profile requires full server-side re-evaluation. Unknown is not pass.';}audit(d,'profile_version_created',{version:store.profile.version});}
   persist();return clone(store.profile);
  }
  const m=path.match(/^\/api\/opportunities\/(\d+)(?:\/(.*))?$/);if(m){const d=ensureVisible(Number(m[1]));const suffix=m[2]||'';
   if(!suffix&&method==='GET')return clone(d);
   const fm=suffix.match(/^fields\/([a-z_]+)$/);
   if(fm&&method==='PUT'){
    const f=d.fields.find(x=>x.key===fm[1]);if(!f)error('Unrecognized intake field',404);
    const action=body.action;if(!['confirm','edit','missing','reject'].includes(action))error('Unrecognized review action');
    let chosen=null,value=null,status='missing',origin='unavailable';
    if(action==='confirm'){
     chosen=f.candidates.find(c=>c.id===Number(body.candidateId??f.candidateId));if(!chosen)error('Citation must belong to this field and opportunity',404);
     value=chosen.value;status='confirmed';origin='confirmed_source';
    }else if(action==='edit'){value=String(body.value||'').trim().slice(0,1200);if(!value)error('Edited value cannot be blank');status='edited';origin='manual';}
    else status=action==='reject'?'rejected':'missing';
    f.current=value;f.status=status;f.valueOrigin=origin;f.currentCitation=chosen?{id:chosen.citationId,excerpt:chosen.excerpt,pageIndex:chosen.pageIndex,printedLabel:chosen.printedLabel,documentId:chosen.documentId,filename:chosen.filename,role:chosen.role,method:chosen.method,warning:chosen.warning}:null;
    f.review={status,value,needsRereview:false,reviewer:actor,updatedAt:new Date().toISOString()};
    f.candidates.forEach(c=>c.isAccepted=!!chosen&&chosen.id===c.id);
    audit(d,'field_reviewed',{field:f.key,action,sourceCandidate:chosen?.id??null});persist();return {ok:true};
   }
   if(suffix==='decisions'&&method==='POST'){
    if(ACTORS[actor].role!=='director')error('Director simulation role required',403);
    if(!['pursue','decline','needs_discussion'].includes(body.decision)||String(body.rationale||'').trim().length<8)error('Select decision and enter a rationale of at least 8 characters');
    d.decisions.unshift({id:d.decisions.length+1,opportunity_id:d.opportunity.id,actor,decision:body.decision,rationale:String(body.rationale).slice(0,2000),created_at:new Date().toISOString()});audit(d,'review_decision',{decision:body.decision});persist();return {ok:true};
   }
  }
  error('This public gallery supports fictional review only. PDF ingestion, arbitrary opportunity creation, and processing require the local app.',405);
 }
 function saveJson(filename,data){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200)}
 function createPrint(d){
  const p=makePacket(d);
  const rows=d.fields.map(f=>`<tr><th>${escapeHTML(f.label)}</th><td><strong>${escapeHTML(f.current||'—')}</strong><small>${escapeHTML(f.status)} · ${escapeHTML(f.valueOrigin)}</small></td><td>${f.valueOrigin==='confirmed_source'&&f.currentCitation?`${escapeHTML(f.currentCitation.filename)} · PDF p.${f.currentCitation.pageIndex+1}<blockquote>${escapeHTML(f.currentCitation.excerpt)}</blockquote>`:f.valueOrigin==='manual'?'Manually supplied; not sourced':f.citation?`PROPOSED ONLY · ${escapeHTML(f.citation.filename)}, PDF p.${f.citation.pageIndex+1}`:'No source reference'}</td></tr>`).join('');
  const revisions=p.revisions.map(r=>`<article><h3>${escapeHTML(r.label)}</h3><div class="pair"><div><span>EARLIER DOCUMENT</span><p>${escapeHTML(r.alternatives.at(-1)?.value||'—')}</p><small>${escapeHTML(r.alternatives.at(-1)?.filename||'')}</small></div><div><span>NEWEST PROPOSAL</span><p>${escapeHTML(r.proposedValue||'—')}</p><small>${escapeHTML(r.proposedEvidence?.filename||'')}</small></div></div><p>Review: <b>${escapeHTML(r.currentStatus)}</b>; displayed: ${escapeHTML(r.currentValue||'Unreviewed')}</p></article>`).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Director's packet · ${escapeHTML(d.opportunity.title)}</title><style>@page{size:A4;margin:15mm}*{box-sizing:border-box}body{background:#f2f2e9;color:#173b35;font:13px/1.55 system-ui;margin:0}main{max-width:1000px;margin:auto;background:white;padding:42px}header{background:#12372d;color:white;padding:38px;margin:-42px -42px 32px}h1{font:normal 40px/1.1 Georgia,serif;max-width:680px}h2{font:normal 24px Georgia,serif;margin-top:32px;border-bottom:1px solid #cfdbd1}h3{font:normal 18px Georgia,serif}small{display:block;font-size:10px;letter-spacing:.04em;color:#667e75}header small{color:#d9dec6}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #dfe8df;padding:11px;vertical-align:top;overflow-wrap:anywhere}th{width:23%}blockquote{margin:8px 0;color:#557b68;font:italic 12px Georgia,serif}.warning{padding:16px;border-left:4px solid #ad8453;background:#f8f3e6}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pair>div{padding:14px;background:#edf3ec}.pair span{font-size:10px;letter-spacing:.15em;color:#476958}.pair p{font:18px Georgia,serif}article{break-inside:avoid}footer{font-size:11px;color:#60786d;margin-top:30px;border-top:1px solid #cddccf;padding-top:20px}@media print{body{background:white}main{padding:0}header{margin:0 0 30px;print-color-adjust:exact;-webkit-print-color-adjust:exact}.pair>div,.warning{print-color-adjust:exact;-webkit-print-color-adjust:exact}}@media(max-width:650px){main{padding:20px}header{margin:-20px -20px 28px;padding:24px}h1{font-size:28px}.pair{grid-template-columns:1fr}}</style><main><header><small>HARBORLINE / EVIDENCE ATELIER / SYNTHETIC DEMO</small><h1>${escapeHTML(d.opportunity.title)}</h1><p>${escapeHTML(d.opportunity.issuer)} · Fictional case file</p><p>${p.readiness.reviewed} / ${p.readiness.total} fields reviewed · ${p.readiness.openIssues.length} critical issues unresolved</p></header><section class="warning"><b>PUBLIC BROWSER DEMO — NOT A REAL ELIGIBILITY DETERMINATION</b><p>This printable view is generated from local browser review edits only. No real organization or funder is represented.</p><p>${escapeHTML(p.readiness.message)}; unknown requirements must not be interpreted as satisfied.</p></section><h2>01 / Human decision</h2><p><b>${escapeHTML(d.decisions[0]?.decision||'No decision recorded')}</b> — ${escapeHTML(d.decisions[0]?.rationale||'Rationale pending')}</p><h2>02 / Amendment comparison</h2>${revisions||'<p>No differing values detected across retained source documents.</p>'}<h2>03 / Eligibility</h2><table>${d.eligibility.map(e=>`<tr><th>${escapeHTML(e.field_key)}</th><td>${escapeHTML(e.status)}</td><td>${escapeHTML(e.explanation)}</td></tr>`).join('')}</table><h2>04 / Cited fields</h2><table>${rows}</table><footer>${d.documents.map(doc=>`${escapeHTML(doc.filename)} · ${escapeHTML(doc.role)} · SHA-256 ${escapeHTML(doc.sha256)}<br>`).join('')}<p>PDF page index and printed labels are distinct. Source quotations are proposals until explicitly confirmed.</p></footer></main></html>`;
 }
 function exportCase(kind,id){return ready().then(()=>{
  const d=ensureVisible(Number(id));if(kind==='review')saveJson(`harborline-case-${id}.json`,{meta:{demo:true,mode:'browser-only',exportedAt:new Date().toISOString()},...clone(d)});
  else if(kind==='packet')saveJson(`harborline-director-packet-${id}.json`,makePacket(d));
  else if(kind==='print'){
   const blob=new Blob([createPrint(d)],{type:'text/html'});const url=URL.createObjectURL(blob);const page=window.open(url,'_blank','noopener');if(!page){const a=document.createElement('a');a.href=url;a.download=`harborline-director-packet-${id}.html`;a.click();}
   setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
 });}
 document.addEventListener('click',e=>{
  const el=e.target.closest('[data-public-export]');if(el){e.preventDefault();e.stopImmediatePropagation();const [kind,id]=el.dataset.publicExport.split(':');exportCase(kind,id).catch(err=>window.alert(err.message));return;}
  if(e.target.closest('#reset-public-demo')){e.preventDefault();if(confirm('Discard browser-local edits and reset the fictional cases?'))api('/api/reset-demo',{method:'POST',body:'{}'}).then(()=>location.reload());return;}
 },true);
 window.HarborlineStatic={api,imageUrl:(doc,page)=>`./demo/pages/${encodeURIComponent(doc)}-${encodeURIComponent(page)}.jpg`,exportCase,ready};
})();
