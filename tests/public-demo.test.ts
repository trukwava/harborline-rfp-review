import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const read=(p:string)=>JSON.parse(readFileSync(join(root,p),'utf8'));

test('static demo is generated only from the bundled synthetic PDFs with valid document hashes',()=>{
 const data=read('docs/demo/demo-data.json');
 assert.equal(data.mode,'synthetic-static-demo');
 assert.equal(data.details.length,3);
 for(const d of data.details){
  assert.equal(d.opportunity.organization_id,'harbor-demo');
  for(const doc of d.documents){
   const bytes=readFileSync(join(root,'docs','demo','fixtures',doc.filename));
   assert.equal(createHash('sha256').update(bytes).digest('hex'),doc.sha256);
  }
  for(const f of d.fields){
   for(const c of f.candidates){
    assert.ok(d.documents.some((doc:any)=>doc.id===c.documentId));
    assert.ok(d.pages.some((p:any)=>p.document_id===c.documentId&&p.page_index===c.pageIndex));
    assert.ok(c.excerpt?.length>0,`${f.key} candidate must have an excerpt`);
    assert.ok(existsSync(join(root,'docs','demo','pages',`${c.documentId}-${c.pageIndex}.jpg`)));
   }
  }
 }
});

test('static demo preserves deadline amendment conflict and unknown requirements',()=>{
 const data=read('docs/demo/demo-data.json');
 const workforce=data.details.find((d:any)=>d.opportunity.title==='Workforce Pathways Partnership');
 const f=workforce.fields.find((f:any)=>f.key==='submission_deadline');
 assert.ok(f.candidates.some((c:any)=>String(c.value).includes('November 20, 2027')));
 assert.ok(f.candidates.some((c:any)=>String(c.value).includes('December 3, 2027')));
 assert.equal(f.status,'conflicted');
 assert.notEqual(f.candidates[0].documentId,f.candidates[f.candidates.length-1].documentId);
 const housing=data.details.find((d:any)=>d.opportunity.title==='Housing Navigation Capacity Fund');
 const credential=housing.eligibility.find((e:any)=>e.field_key==='required_registrations');
 assert.equal(credential.status,'unknown');
 assert.ok(housing.pages.some((p:any)=>p.method==='ocr'));
 assert.ok(data.details.some((d:any)=>d.fields.some((f:any)=>f.key==='match_requirement'&&f.proposed==null)));
});
