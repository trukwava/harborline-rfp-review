import http, {type IncomingMessage,type ServerResponse} from 'node:http';
import {readFileSync,writeFileSync,existsSync,copyFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {join,resolve,basename,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openDb,tx} from './db.ts';
import {FIELDS,FIELD_KEYS,extractCandidates,normalizeDeadline,compareRequirement,type OrganizationProfile,type Page} from './domain.ts';
import type {DatabaseSync} from 'node:sqlite';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const FIXTURES=join(ROOT,'fixtures');
const DEFAULT_PROFILE:OrganizationProfile={name:'Harbor Community Services (fictional)',version:1,
 mission:'Housing stability and workforce development programs for underserved New Yorkers.',
 geography:'New York City',credentials:['501(c)(3) recognition'],negative_evidence:[],
 notes:'Synthetic demonstration profile. Credential claims are not verified documents.'};
const ACTORS:Record<string,{organization:string;role:string}>={
 'harbor-analyst':{organization:'harbor-demo',role:'analyst'},
 'harbor-director':{organization:'harbor-demo',role:'director'},
 'other-analyst':{organization:'other-demo',role:'analyst'}
};
const MAX_BYTES=8*1024*1024;
const cleanStr=(v:unknown,max=300)=>typeof v==='string'?v.trim().slice(0,max):'';
type Row=Record<string,any>;
export function makeService(dataDir=join(ROOT,'data')){
 const db=openDb(join(dataDir,'review.sqlite'));
 const uploads=join(dataDir,'uploads'),previews=join(dataDir,'previews');
 mkdirSync(uploads,{recursive:true});mkdirSync(previews,{recursive:true});
 const audit=(opportunityId:number|null,actor:string,event_type:string,payload:Record<string,unknown>)=>
  db.prepare('INSERT INTO audit_events(opportunity_id,actor,event_type,payload_json) VALUES (?,?,?,?)').run(opportunityId,actor,event_type,JSON.stringify(payload));
 const orgProfile=(organization:string)=>{
  const row=db.prepare('SELECT * FROM organization_profile_versions WHERE organization_id=? ORDER BY version DESC LIMIT 1').get(organization) as Row|undefined;
  if(!row)return null;
  return {...JSON.parse(row.data_json),id:row.id} as OrganizationProfile &{id:number};
 };
 function ensureOpportunity(id:number,organization:string):Row {
  const row=db.prepare('SELECT * FROM opportunities WHERE id=? AND organization_id=?').get(id,organization) as Row|undefined;
  if(!row){const err:any=new Error('Opportunity not found in this organization');err.status=404;throw err;}
  return row;
 }
 const docs=(id:number)=>db.prepare('SELECT id,role,sha256,filename,created_at FROM source_document_versions WHERE opportunity_id=? ORDER BY id').all(id) as Row[];
 function candidateRows(id:number):Row[]{
  return db.prepare(`SELECT c.id,c.field_key,c.value,c.raw_value,ci.excerpt,ci.id AS citation_id,
    p.id AS page_id,p.page_index,p.printed_label,p.method,p.warning,
    d.id AS document_id,d.filename,d.role,r.id AS run_id
    FROM extracted_field_candidates c
    JOIN ingestion_runs r ON r.id=c.run_id
    JOIN source_document_versions d ON d.id=r.document_id
    JOIN citations ci ON ci.id=c.citation_id
    JOIN source_pages p ON p.id=ci.page_id
    WHERE d.opportunity_id=?
    ORDER BY (CASE WHEN d.role='amendment' THEN 2 WHEN d.role='base' THEN 1 ELSE 0 END) DESC,d.id DESC,r.id DESC,c.id DESC`).all(id) as Row[];
 }
 function fieldsFor(id:number){
  const rows=candidateRows(id), reviews=db.prepare('SELECT * FROM field_reviews WHERE opportunity_id=?').all(id) as Row[];
  const rev=new Map(reviews.map(r=>[r.field_key,r]));
  return FIELDS.map(([key,label])=>{
   const candidates=rows.filter(r=>r.field_key===key);
   const latest=candidates[0]||null;
   const values=[...new Set(candidates.map(c=>c.value))];
   const review=rev.get(key)||null;
   const accepted=review?.status==='confirmed'?rows.find(r=>r.field_key===key && r.id===review.based_on_candidate_id):null;
   const citationFor=(r:Row|null|undefined)=>r?{id:r.citation_id,excerpt:r.excerpt,pageIndex:r.page_index,printedLabel:r.printed_label,
      documentId:r.document_id,filename:r.filename,role:r.role,method:r.method,warning:r.warning}:null;
   // Reprocessing may create identical candidates. One visible choice per document/value is enough.
   const choices=candidates.filter((c,i)=>candidates.findIndex(other=>other.document_id===c.document_id && other.value===c.value)===i);
   const isConflicted=values.length>1;
   return {key,label,proposed:latest?.value||null,raw:latest?.raw_value||null,
    current:review?.status==='missing'||review?.status==='rejected'?null:review?.value??latest?.value??null,
    status: review?.needs_rereview?'conflicted':review?.status??(isConflicted?'conflicted':latest?'proposed':'missing'),
    valueOrigin: review?.status==='edited'?'manual':review?.status==='confirmed'?'confirmed_source':latest?'machine_proposal':'unavailable',
    conflicts:isConflicted?values:[],review:review?{status:review.status,value:review.value,needsRereview:!!review.needs_rereview,reviewer:review.reviewer,updatedAt:review.updated_at}:null,
    citation:citationFor(latest), currentCitation:citationFor(accepted),
    candidates:choices.map(c=>({id:c.id,value:c.value,raw:c.raw_value,citationId:c.citation_id,documentId:c.document_id,
      filename:c.filename,role:c.role,pageIndex:c.page_index,printedLabel:c.printed_label,method:c.method,
      warning:c.warning,excerpt:c.excerpt,isAccepted:!!accepted && accepted.document_id===c.document_id && accepted.value===c.value})),
    candidateId:latest?.id||null
   };
  });
 }
 function refreshDerived(id:number,organization:string){
  const profile=orgProfile(organization);if(!profile)throw new Error('Organization profile unavailable');
  const fields=fieldsFor(id);
  for(const key of ['eligible_applicants','required_registrations','geography']){
   const field=fields.find(f=>f.key===key)!;
   if(!field.proposed){db.prepare('DELETE FROM eligibility_criteria WHERE opportunity_id=? AND field_key=?').run(id,key);continue;}
   const result=compareRequirement(key,field.proposed,profile);
   db.prepare(`INSERT INTO eligibility_criteria(opportunity_id,field_key,requirement,status,source_citation_id,org_profile_version_id,org_evidence,explanation)
     VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(opportunity_id,field_key) DO UPDATE SET requirement=excluded.requirement,
     status=excluded.status,source_citation_id=excluded.source_citation_id,org_profile_version_id=excluded.org_profile_version_id,
     org_evidence=excluded.org_evidence,explanation=excluded.explanation`).run(id,key,field.proposed,result.status,field.citation!.id,profile.id,result.orgEvidence,result.explanation);
  }
  for(const key of ['submission_deadline','question_deadline']){
   const field=fields.find(f=>f.key===key)!;
   if(!field.proposed){db.prepare('DELETE FROM deadlines WHERE opportunity_id=? AND field_key=?').run(id,key);continue;}
   const norm=normalizeDeadline(field.proposed);
   db.prepare(`INSERT INTO deadlines(opportunity_id,field_key,original,normalized,kind,timezone,source_citation_id)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(opportunity_id,field_key) DO UPDATE SET original=excluded.original,
      normalized=excluded.normalized,kind=excluded.kind,timezone=excluded.timezone,source_citation_id=excluded.source_citation_id`).run(
     id,key,norm.original,norm.iso,norm.kind,norm.zone,field.citation!.id);
  }
 }
 function addDocument(opportunityId:number,organization:string,filename:string,bytes:Buffer,role:string,actor:string){
  ensureOpportunity(opportunityId,organization);
  if(!['base','attachment','amendment'].includes(role))throw Object.assign(new Error('Invalid document role'),{status:400});
  if(bytes.length>MAX_BYTES||bytes.length<8||bytes.subarray(0,5).toString()!=='%PDF-')throw Object.assign(new Error('PDF must be valid and at most 8 MB'),{status:400});
  const hash=createHash('sha256').update(bytes).digest('hex');
  const dup=db.prepare('SELECT id FROM source_document_versions WHERE opportunity_id=? AND sha256=?').get(opportunityId,hash) as Row|undefined;
  if(dup)return {duplicate:true,documentId:dup.id};
  const safeFilename=(basename(filename).replace(/[^A-Za-z0-9._-]/g,'_')||'upload.pdf').slice(0,120);
  const path=join(uploads,hash+'.pdf'), previewDir=join(previews,hash);
  const fileExisted=existsSync(path);
  if(!fileExisted)writeFileSync(path,bytes);
  let parsed:{pages:Page[]};
  try{
   const output=execFileSync('python',[join(ROOT,'tools/pdf_adapter.py'),path,previewDir],{encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024});
   parsed=JSON.parse(output);
   if(!parsed.pages?.length)throw new Error('PDF contained no readable pages');
  }catch(e:any){
   // Do not persist malformed documents; cleanup only files from this attempt.
   if(!fileExisted)try{unlinkSync(path)}catch{}
   throw Object.assign(new Error('PDF extraction failed: '+(e.message||String(e)).slice(0,200)),{status:400});
  }
  const before=new Map(fieldsFor(opportunityId).map(f=>[f.key,f.proposed]));
  const documentId=tx(db,()=>{
   const result=db.prepare('INSERT INTO source_document_versions(opportunity_id,role,sha256,filename,file_path) VALUES(?,?,?,?,?)')
    .run(opportunityId,role,hash,safeFilename,path);
   const docId=Number(result.lastInsertRowid);
   for(const p of parsed.pages){
    db.prepare('INSERT INTO source_pages(document_id,page_index,printed_label,body,method,warning,preview_path) VALUES(?,?,?,?,?,?,?)')
     .run(docId,p.index,p.printed_label,p.text,p.method,p.warning,join(previewDir,`page-${p.index}.jpg`));
   }
   makeRun(docId,parsed.pages);
   const after=fieldsFor(opportunityId);
   for(const field of after){
    if(before.get(field.key)!==null && before.get(field.key)!==field.proposed){
     db.prepare('UPDATE field_reviews SET needs_rereview=1 WHERE opportunity_id=? AND field_key=?').run(opportunityId,field.key);
    }
   }
   refreshDerived(opportunityId,organization);
   audit(opportunityId,actor,'document_ingested',{documentId:docId,sha256:hash,role,pages:parsed.pages.length});
   return docId;
  });
  return {duplicate:false,documentId};
 }
 function makeRun(docId:number,pages:Page[]){
  const role=(db.prepare('SELECT role FROM source_document_versions WHERE id=?').get(docId) as Row).role;
  const runId=Number(db.prepare("INSERT INTO ingestion_runs(document_id,state) VALUES(?,'completed')").run(docId).lastInsertRowid);
  const pageIds=new Map((db.prepare('SELECT id,page_index,body FROM source_pages WHERE document_id=?').all(docId) as Row[]).map(p=>[p.page_index,p]));
  const candidates=extractCandidates(pages,role);
  for(const c of candidates){
   const page=pageIds.get(c.pageIndex)!;
   if(!page.body.includes(c.excerpt))throw new Error('Rejected unsupported citation');
   const citeId=Number(db.prepare('INSERT INTO citations(page_id,excerpt) VALUES(?,?)').run(page.id,c.excerpt).lastInsertRowid);
   db.prepare('INSERT INTO extracted_field_candidates(run_id,field_key,value,raw_value,citation_id) VALUES(?,?,?,?,?)').run(runId,c.key,c.value,c.raw,citeId);
  }
  return {runId,extractedCount:candidates.length};
 }
 function rerun(documentId:number,organization:string,actor:string){
  const doc=db.prepare(`SELECT d.*,o.organization_id FROM source_document_versions d JOIN opportunities o ON o.id=d.opportunity_id WHERE d.id=? AND o.organization_id=?`).get(documentId,organization) as Row|undefined;
  if(!doc)throw Object.assign(new Error('Document not found'),{status:404});
  const pages=(db.prepare('SELECT * FROM source_pages WHERE document_id=? ORDER BY page_index').all(documentId) as Row[]).map(p=>({index:p.page_index,printed_label:p.printed_label,text:p.body,method:p.method,warning:p.warning}));
  return tx(db,()=>{const result=makeRun(documentId,pages);refreshDerived(doc.opportunity_id,organization);audit(doc.opportunity_id,actor,'reprocessed',{documentId,runId:result.runId});return result;});
 }
 function createOpportunity(organization:string,title:string,issuer:string,sourceUrl:string|null,actor:string){
  if(!title||!issuer)throw Object.assign(new Error('Title and issuer required'),{status:400});
  if(sourceUrl && !/^https:\/\//.test(sourceUrl))throw Object.assign(new Error('Official URL must start with https://'),{status:400});
  return tx(db,()=>{
   db.prepare('INSERT OR IGNORE INTO opportunities(organization_id,title,issuer,source_url) VALUES(?,?,?,?)').run(organization,title,issuer,sourceUrl);
   const id=Number((db.prepare('SELECT id FROM opportunities WHERE organization_id=? AND title=? AND issuer=?').get(organization,title,issuer) as Row).id);
   audit(id,actor,'opportunity_created',{title,issuer});return {id};
  });
 }
 function getDetail(id:number,organization:string){
  const opportunity=ensureOpportunity(id,organization);
  return {opportunity,fields:fieldsFor(id),documents:docs(id),
   pages:db.prepare(`SELECT p.id,p.document_id,p.page_index,p.printed_label,p.method,p.warning,
     d.filename,d.role FROM source_pages p JOIN source_document_versions d ON d.id=p.document_id WHERE d.opportunity_id=? ORDER BY d.id,p.page_index`).all(id),
   eligibility:db.prepare('SELECT * FROM eligibility_criteria WHERE opportunity_id=? ORDER BY field_key').all(id),
   deadlines:db.prepare('SELECT * FROM deadlines WHERE opportunity_id=? ORDER BY field_key').all(id),
   decisions:db.prepare('SELECT * FROM review_decisions WHERE opportunity_id=? ORDER BY id DESC').all(id),
   audit:db.prepare('SELECT actor,event_type,payload_json,created_at FROM audit_events WHERE opportunity_id=? ORDER BY id DESC LIMIT 30').all(id),
   profile:orgProfile(organization)};
 }
 function seedDemo(){
  if(!orgProfile('harbor-demo'))db.prepare('INSERT INTO organization_profile_versions(organization_id,version,data_json) VALUES(?,?,?)').run('harbor-demo',1,JSON.stringify(DEFAULT_PROFILE));
  if((db.prepare("SELECT COUNT(*) AS n FROM opportunities WHERE organization_id='harbor-demo'").get() as Row).n>0)return;
  const fixtures:[string,string,string,string,string[]][]=[
   ['Neighborhood Stabilization Microgrants','City Community Initiatives Office (fictional)','', '01-neighborhood-stability.pdf',[]],
   ['Housing Navigation Capacity Fund','Community Housing Alliance (fictional)','', '02-housing-scan.pdf',[]],
   ['Workforce Pathways Partnership','Regional Opportunity Partnership (fictional)','', '03-workforce-base.pdf',['03-workforce-amendment.pdf']]
  ];
  for(const [title,issuer,url,base,amendments] of fixtures){
   const {id}=createOpportunity('harbor-demo',title,issuer,url||null,'system');
   addDocument(id,'harbor-demo',base,readFileSync(join(FIXTURES,base)),'base','system');
   for(const file of amendments)addDocument(id,'harbor-demo',file,readFileSync(join(FIXTURES,file)),'amendment','system');
  }
 }
 function resetDemo(organization:string){
  if(organization!=='harbor-demo')throw Object.assign(new Error('Only the fictional Harbor tenant can be reset'),{status:403});
  tx(db,()=>{db.prepare("DELETE FROM opportunities WHERE organization_id='harbor-demo'").run();db.prepare("DELETE FROM organization_profile_versions WHERE organization_id='harbor-demo'").run();});
  seedDemo();return {reset:true};
 }
 return {db,orgProfile,ensureOpportunity,addDocument,createOpportunity,getDetail,rerun,refreshDerived,audit,seedDemo,resetDemo};
}


/** A director's packet is a read-only projection: it never changes review decisions. */
export function directorPacket(detail:ReturnType<ReturnType<typeof makeService>['getDetail']>){
 const critical=['submission_deadline','eligible_applicants','geography','required_registrations','mandatory_attachments','match_requirement'];
 const openIssues=detail.fields.filter(f=>critical.includes(f.key)&&f.status!=='confirmed'&&f.status!=='edited')
   .map(f=>({field:f.key,label:f.label,status:f.status,reason:f.proposed?'Source proposal requires human review':'No sourced value established'}));
 const unknownCriteria=detail.eligibility.filter(e=>e.status!=='pass').map(e=>({field:e.field_key,assessment:e.status,requirement:e.requirement,explanation:e.explanation}));
 const fieldRevisions=detail.fields.filter(f=>f.conflicts.length>0).map(f=>({
  field:f.key,label:f.label,currentStatus:f.status,currentValue:f.current,reviewedEvidence:f.currentCitation,
  proposedValue:f.proposed,proposedEvidence:f.citation,alternatives:f.candidates
 }));
 const reviewed=detail.fields.filter(f=>f.status==='confirmed'||f.status==='edited').length;
 return {kind:'director_review_packet',demo:true,generatedAt:new Date().toISOString(),
  opportunity:detail.opportunity,profileVersion:detail.profile?.version??null,
  readiness:{reviewed,total:detail.fields.length,openIssues,unknownCriteria,
   message:openIssues.length||unknownCriteria.length?'Discussion required: unresolved requirements remain':'Critical items reviewed; director must still judge independently'},
  revisions:fieldRevisions,
  fields:detail.fields.map(f=>({key:f.key,label:f.label,status:f.status,acceptedOrDisplayedValue:f.current,
   source:f.review?.status==='confirmed'?f.currentCitation:null,proposedSource:f.citation,
   manuallySupplied:f.valueOrigin==='manual',needsRereview:!!f.review?.needsRereview})),
  deadlines:detail.deadlines,eligibility:detail.eligibility,decisions:detail.decisions,documents:detail.documents};
}

function send(res:ServerResponse,status:number,data:unknown,contentType='application/json; charset=utf-8'){
 res.writeHead(status,{'Content-Type':contentType,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'self'; object-src 'none'"});
 res.end(typeof data==='string'?data:JSON.stringify(data));
}
function htmlEscape(s:unknown){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!));}
async function body(req:IncomingMessage):Promise<any>{
 const chunks:Buffer[]=[];let count=0;
 for await(const chunk of req){count+=chunk.length;if(count>MAX_BYTES*1.45)throw Object.assign(new Error('Request too large'),{status:413});chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString()||'{}')}catch{throw Object.assign(new Error('Invalid JSON'),{status:400});}
}
function actorFor(req:IncomingMessage){
 const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(c=>c.trim().split('=').map(decodeURIComponent)).filter(([k,v])=>k&&v));
 const name=String(req.headers['x-demo-user']||cookies.demo_user||'harbor-analyst');
 const actor=ACTORS[name];if(!actor)throw Object.assign(new Error('Unknown demo user'),{status:403});
 return {name,...actor};
}

export function createApp(dataDir?:string){
 if(process.env.DEMO_MODE==='false')throw new Error('Connected mode is not implemented; refusing to run without demo-only authentication.');
 const service=makeService(dataDir);service.seedDemo();const {db}=service;
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url||'/', 'http://localhost');const path=url.pathname;
   const a=actorFor(req); const method=req.method||'GET';
   if(path==='/api/session' && method==='POST'){
    const b=await body(req);if(!ACTORS[b.actor])throw Object.assign(new Error('Invalid actor'),{status:400});
    res.setHeader('Set-Cookie',`demo_user=${b.actor}; Path=/; SameSite=Lax; HttpOnly`);
    return send(res,200,{actor:b.actor,role:ACTORS[b.actor].role});
   }
   if(path==='/api/session' && method==='GET')return send(res,200,{actor:a.name,role:a.role,organization:a.organization,demo:true});
   if(path==='/api/opportunities' && method==='GET'){
    const list=db.prepare(`SELECT o.*, (SELECT COUNT(*) FROM source_document_versions d WHERE d.opportunity_id=o.id) AS document_count,
     (SELECT decision FROM review_decisions r WHERE r.opportunity_id=o.id ORDER BY r.id DESC LIMIT 1) AS decision
     FROM opportunities o WHERE organization_id=? ORDER BY o.id`).all(a.organization);
    return send(res,200,{opportunities:list,profile:service.orgProfile(a.organization)});
   }
   if(path==='/api/opportunities' && method==='POST'){
    const b=await body(req);return send(res,201,service.createOpportunity(a.organization,cleanStr(b.title),cleanStr(b.issuer),cleanStr(b.sourceUrl,500)||null,a.name));
   }
   if(path==='/api/profile' && method==='PUT'){
    const b=await body(req);const old=service.orgProfile(a.organization);
    if(!old)throw Object.assign(new Error('Profile not found'),{status:404});
    if(!Array.isArray(b.credentials)||!Array.isArray(b.negative_evidence))throw Object.assign(new Error('Expected credential and negative-evidence arrays'),{status:400});
    const next:OrganizationProfile={name:cleanStr(b.name)||old.name,mission:cleanStr(b.mission,1500),geography:cleanStr(b.geography,300),
     credentials:b.credentials.map((x:unknown)=>cleanStr(x,200)).filter(Boolean).slice(0,30),
     negative_evidence:b.negative_evidence.map((x:unknown)=>cleanStr(x,200)).filter(Boolean).slice(0,30),notes:cleanStr(b.notes,1200),version:old.version+1};
    tx(db,()=>{db.prepare('INSERT INTO organization_profile_versions(organization_id,version,data_json) VALUES(?,?,?)').run(a.organization,next.version,JSON.stringify(next));
     const ids=db.prepare('SELECT id FROM opportunities WHERE organization_id=?').all(a.organization) as Row[];
     for(const {id} of ids){service.refreshDerived(id,a.organization);service.audit(id,a.name,'profile_version_created',{version:next.version});}
    });return send(res,200,next);
   }
   if(path==='/api/reset-demo'&&method==='POST')return send(res,200,service.resetDemo(a.organization));
   const m=path.match(/^\/api\/opportunities\/(\d+)(?:\/(.*))?$/);
   if(m){
    const id=Number(m[1]);service.ensureOpportunity(id,a.organization);
    const suffix=m[2]||'';
    if(!suffix && method==='GET')return send(res,200,service.getDetail(id,a.organization));
    if(suffix==='documents'&&method==='POST'){
     const b=await body(req);const content=cleanStr(b.contentBase64,MAX_BYTES*1.4);const bytes=Buffer.from(content,'base64');
     return send(res,201,service.addDocument(id,a.organization,cleanStr(b.filename,200),bytes,cleanStr(b.role),a.name));
    }
    const fm=suffix.match(/^fields\/([a-z_]+)$/);
    if(fm&&method==='PUT'){
     const key=fm[1];if(!FIELD_KEYS.has(key))throw Object.assign(new Error('Unknown field'),{status:400});
     const b=await body(req);const action=cleanStr(b.action);
     if(!['confirm','edit','missing','reject'].includes(action))throw Object.assign(new Error('Unknown field action'),{status:400});
     const field=service.getDetail(id,a.organization).fields.find(x=>x.key===key)!;
     let value:string|null=null,status:string,basedOnCandidateId:number|null=null;
     if(action==='confirm'){
      if(!field.candidateId)throw Object.assign(new Error('Cannot confirm a field without source evidence; use manual edit'),{status:400});
      const requested=b.candidateId==null?field.candidateId:Number(b.candidateId);
      if(!Number.isSafeInteger(requested)||requested<1)throw Object.assign(new Error('Invalid source candidate'),{status:400});
      // Validate candidate ownership and field against the opportunity; old evidence remains selectable.
      const candidate=db.prepare(`SELECT c.id,c.value FROM extracted_field_candidates c
        JOIN ingestion_runs r ON r.id=c.run_id JOIN source_document_versions d ON d.id=r.document_id
        WHERE c.id=? AND c.field_key=? AND d.opportunity_id=?`).get(requested,key,id) as Row|undefined;
      if(!candidate)throw Object.assign(new Error('Source candidate not found for this field'),{status:404});
      value=candidate.value;basedOnCandidateId=candidate.id;status='confirmed';
     }else if(action==='edit'){
      value=cleanStr(b.value,1200);if(!value)throw Object.assign(new Error('Edited value cannot be blank'),{status:400});status='edited';
     }else{status=action==='missing'?'missing':'rejected';}
     tx(db,()=>{
      db.prepare(`INSERT INTO field_reviews(opportunity_id,field_key,status,value,based_on_candidate_id,needs_rereview,reviewer)
        VALUES(?,?,?,?,?,0,?) ON CONFLICT(opportunity_id,field_key) DO UPDATE SET status=excluded.status,value=excluded.value,
        based_on_candidate_id=excluded.based_on_candidate_id,needs_rereview=0,reviewer=excluded.reviewer,updated_at=datetime('now')`)
       .run(id,key,status,value,basedOnCandidateId,a.name);
      service.audit(id,a.name,'field_reviewed',{field:key,action,sourceCandidate:basedOnCandidateId});
     });return send(res,200,{ok:true});
    }
    if(suffix==='decisions'&&method==='POST'){
     if(a.role!=='director')throw Object.assign(new Error('Only the demo director may record a decision'),{status:403});
     const b=await body(req),decision=cleanStr(b.decision),rationale=cleanStr(b.rationale,2000);
     if(!['pursue','decline','needs_discussion'].includes(decision)||rationale.length<8)throw Object.assign(new Error('Decision and rationale of at least 8 characters required'),{status:400});
     tx(db,()=>{db.prepare('INSERT INTO review_decisions(opportunity_id,decision,rationale,actor) VALUES(?,?,?,?)').run(id,decision,rationale,a.name);
      service.audit(id,a.name,'review_decision',{decision});});return send(res,201,{ok:true});
    }
    if(suffix==='export.json'&&method==='GET'){
     const detail=service.getDetail(id,a.organization);
     res.setHeader('Content-Disposition',`attachment; filename="opportunity-${id}-review.json"`);
     return send(res,200,{meta:{demo:true,exportedAt:new Date().toISOString(),version:1},...detail});
    }
    if(suffix==='packet.json'&&method==='GET'){
     res.setHeader('Content-Disposition',`attachment; filename="opportunity-${id}-director-packet.json"`);
     return send(res,200,directorPacket(service.getDetail(id,a.organization)));
    }
    if(suffix==='print'&&method==='GET'){
     const d=service.getDetail(id,a.organization);
     const packet=directorPacket(d);
     const badge=(status:string)=>`<span class="flag">${htmlEscape(status.replaceAll('_',' '))}</span>`;
     const cite=(f:typeof d.fields[number])=>f.review?.status==='confirmed'&&f.currentCitation?
      `${htmlEscape(f.currentCitation.filename)} · PDF p.${f.currentCitation.pageIndex+1}${f.currentCitation.printedLabel?` / printed ${htmlEscape(f.currentCitation.printedLabel)}`:''}<blockquote>${htmlEscape(f.currentCitation.excerpt)}</blockquote>${f.review?.needsRereview?'NEEDS RE-REVIEW · newer source proposal differs':''}`:
      f.status==='edited'?'Human-supplied edit · no source attestation for edited text':
      f.citation?`PROPOSAL ONLY · ${htmlEscape(f.citation.filename)}, PDF p.${f.citation.pageIndex+1}`:'No source available';
     const rows=d.fields.map(f=>`<tr><th>${htmlEscape(f.label)}</th><td>${htmlEscape(f.current||'—')}<div>${badge(f.status)}</div></td><td>${cite(f)}</td></tr>`).join('');
     const issues=packet.readiness.openIssues.map(x=>`<li>${htmlEscape(x.label)} · ${htmlEscape(x.status)} — ${htmlEscape(x.reason)}</li>`).join('')||'<li>No open critical-field issues recorded. Director judgment is still required.</li>';
     const revisions=packet.revisions.map(r=>`<section class="revision"><h3>${htmlEscape(r.label)}</h3><div class="comparison"><div><small>EARLIER / RETAINED SOURCE</small><p>${htmlEscape(r.alternatives[r.alternatives.length-1]?.value||'—')}</p><small>${htmlEscape(r.alternatives[r.alternatives.length-1]?.filename||'')}</small></div><div><small>NEWEST PROPOSAL</small><p>${htmlEscape(r.proposedValue||'—')}</p><small>${htmlEscape(r.proposedEvidence?.filename||'')} · PDF p.${(r.proposedEvidence?.pageIndex??0)+1}</small></div></div><p><strong>Displayed value (review status shown separately):</strong> ${htmlEscape(r.currentValue||'Unreviewed')} · ${htmlEscape(r.currentStatus)}</p></section>`).join('');
     const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Director packet — ${htmlEscape(d.opportunity.title)}</title><style>
      @page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;color:#183b36;background:#f5f6f0;font:13px/1.6 system-ui,Arial,sans-serif}main{max-width:1050px;margin:auto;background:white;padding:48px}header{background:#12382f;color:#e8ede4;padding:36px 38px;margin:-48px -48px 35px}header small{letter-spacing:2px;color:#bad4bd;font-weight:700}h1{font:normal 39px/1.12 Georgia,serif;margin:12px 0}h2{font:normal 24px Georgia,serif;padding-bottom:8px;border-bottom:1px solid #cbd9d1}h3{font:normal 19px Georgia,serif;margin-bottom:8px}p{overflow-wrap:anywhere}small{font-size:10px;color:#778d84}header small{color:#b8d3bb}.hero-facts{display:flex;gap:30px;flex-wrap:wrap;margin-top:25px}.hero-facts strong{font-size:23px;display:block}section{margin:27px 0;break-inside:avoid}table{width:100%;border-collapse:collapse}td,th{padding:10px;vertical-align:top;border-bottom:1px solid #dce6e0;text-align:left;overflow-wrap:anywhere}th{width:18%;color:#34594e}.flag{display:inline-block;background:#eef4ed;color:#466957;font-size:10px;text-transform:uppercase;letter-spacing:.7px;padding:2px 6px;margin-top:5px}blockquote{margin:5px 0;color:#54766b;font:italic 12px/1.5 Georgia,serif}.warning{border-left:4px solid #b98d4f;background:#fcf6ec;padding:15px 18px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:13px}.comparison>div{background:#f1f6f1;border:1px solid #dce7db;padding:15px}.comparison p{font:normal 17px Georgia,serif;margin:7px 0}.revision{break-inside:avoid}footer{border-top:1px solid #dce7df;padding-top:20px;font-size:11px;color:#637e71}@media print{body{background:white}main{padding:0}header{margin:0 0 25px;padding:25px;print-color-adjust:exact;-webkit-print-color-adjust:exact}.warning,.comparison>div{print-color-adjust:exact;-webkit-print-color-adjust:exact}button{display:none}}@media(max-width:650px){main{padding:18px}header{margin:-18px -18px 25px;padding:24px}h1{font-size:28px}.comparison{grid-template-columns:1fr}table{font-size:11px}}
      </style></head><body><main><header><small>HARBORLINE / EVIDENCE EDITION / DIRECTOR'S PACKET</small><h1>${htmlEscape(d.opportunity.title)}</h1><p>${htmlEscape(d.opportunity.issuer)} · Synthetic organization profile v${packet.profileVersion??'—'}</p><div class="hero-facts"><div><small>FIELD REVIEWS</small><strong>${packet.readiness.reviewed}/${packet.readiness.total}</strong></div><div><small>CRITICAL ISSUES</small><strong>${packet.readiness.openIssues.length}</strong></div><div><small>NON-PASS CRITERIA</small><strong>${packet.readiness.unknownCriteria.length}</strong></div></div></header>
      <section class="warning"><strong>DECISION SUPPORT ONLY · HUMAN REVIEW REQUIRED</strong><p>${htmlEscape(packet.readiness.message)}. Machine-proposed values are not verified. Unknown is never treated as pass.</p><ul>${issues}</ul></section>
      <section><h2>01 / Decision record</h2><p><strong>${htmlEscape(String(d.decisions[0]?.decision??'No decision recorded').replaceAll('_',' ')||'No decision recorded')}</strong> — ${htmlEscape(d.decisions[0]?.rationale||'Director rationale pending')}</p><small>${htmlEscape(d.decisions[0]?.actor||'Not yet signed')} · ${htmlEscape(d.decisions[0]?.created_at||'Unrecorded')}</small></section>
      <section><h2>02 / Source revisions</h2>${revisions||'<p>No conflicting source values recorded.</p>'}</section>
      <section><h2>03 / Eligibility and unresolved evidence</h2><table>${d.eligibility.map(e=>`<tr><th>${htmlEscape(String(e.field_key).replaceAll('_',' '))}</th><td>${htmlEscape(e.status)} · ${htmlEscape(e.requirement)}</td><td>${htmlEscape(e.org_evidence)} · ${htmlEscape(e.explanation)}</td></tr>`).join('')}</table></section>
      <section><h2>04 / Field-by-field attestation</h2><table>${rows}</table></section>
      <footer><strong>Retained source versions</strong><p>${d.documents.map(x=>htmlEscape(`${x.filename} · ${x.role} · SHA-256 ${x.sha256}`)).join('<br>')}</p><p>Source citations refer to PDF page indices (one-based) and printed page labels where available. Manual edits are not represented as source quotations. This demo is not an eligibility certification or an official grant application.</p></footer></main></body></html>`;
     return send(res,200,html,'text/html; charset=utf-8');
    }
   }
   const dm=path.match(/^\/api\/documents\/(\d+)(?:\/(.*))?$/);
   if(dm){
    const docId=Number(dm[1]),doc=db.prepare(`SELECT d.*,o.organization_id FROM source_document_versions d JOIN opportunities o ON o.id=d.opportunity_id WHERE d.id=? AND o.organization_id=?`).get(docId,a.organization) as Row|undefined;
    if(!doc)throw Object.assign(new Error('Document not found'),{status:404});
    const suffix=dm[2]||'';
    if(suffix==='rerun'&&method==='POST')return send(res,200,service.rerun(docId,a.organization,a.name));
    const pm=suffix.match(/^pages\/(\d+)(?:\/(image))?$/);
    if(pm&&method==='GET'){
     const page=db.prepare('SELECT * FROM source_pages WHERE document_id=? AND page_index=?').get(docId,Number(pm[1])) as Row|undefined;
     if(!page)throw Object.assign(new Error('Page not found'),{status:404});
     if(pm[2]==='image'){
      res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
      return res.end(readFileSync(page.preview_path));
     }
     return send(res,200,{index:page.page_index,printedLabel:page.printed_label,text:page.body,method:page.method,warning:page.warning});
    }
   }
   if(method==='GET'&&!path.startsWith('/api/')){
    const file=path==='/'?'index.html':path.slice(1);const full=resolve(ROOT,'public',file);
    if(!full.startsWith(resolve(ROOT,'public')+'/')||!existsSync(full))return send(res,404,{error:'Not found'});
    const type=extname(full)==='.js'?'text/javascript':extname(full)==='.css'?'text/css':'text/html';
    return send(res,200,readFileSync(full).toString(),`${type}; charset=utf-8`);
   }
   return send(res,404,{error:'Not found'});
  }catch(error:any){
   const status=error.status||((error.code==='SQLITE_CONSTRAINT_UNIQUE')?409:500);
   if(status>=500)console.error('Server error:',error.message);
   return send(res,status,{error:status>=500?'Internal error':error.message});
  }
 });
 return {server,service};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||'4173');createApp().server.listen(port,'127.0.0.1',()=>console.log(`Harbor RFP Review (DEMO ONLY): http://127.0.0.1:${port}`));
}
