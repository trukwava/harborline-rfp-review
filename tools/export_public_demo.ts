// Rebuild the public static gallery from the *fictional* Harbor fixtures.
// Never point this exporter at a workspace holding real user data.
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeService,directorPacket} from '../src/server.ts';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const output=join(ROOT,'docs','demo');
const temp=mkdtempSync(join(tmpdir(),'harborline-public-fixture-'));
try {
 const service=makeService(temp);
 service.seedDemo();
 const records=service.db.prepare("SELECT id FROM opportunities WHERE organization_id='harbor-demo' ORDER BY id").all() as {id:number}[];
 const details=records.map(({id})=>service.getDetail(id,'harbor-demo'));
 const list=details.map(d=>({...d.opportunity,document_count:d.documents.length,decision:null}));
 // Explicit immutable source binding for the generated static demo.
 const payload={schema:1,mode:'synthetic-static-demo',profile:details[0].profile,
  opportunities:list,details,
  generatedFrom:'bundled fictional PDF fixtures; deterministic server extractor',
  disclaimer:'No authentication, network API, customer documents, or server-side persistence.'};
 mkdirSync(join(output,'pages'),{recursive:true});
 mkdirSync(join(output,'fixtures'),{recursive:true});
 for(const d of details) for(const doc of d.documents){
  const imgRows=d.pages.filter(p=>p.document_id===doc.id);
  const file=join(ROOT,'fixtures',doc.filename);
  copyFileSync(file,join(output,'fixtures',doc.filename));
  // The server uses hash-derived preview directories; derive them from stored SHA-256.
  for(const p of imgRows) copyFileSync(join(temp,'previews',doc.sha256,`page-${p.page_index}.jpg`),join(output,'pages',`${doc.id}-${p.page_index}.jpg`));
 }
 const target=join(output,'demo-data.json');
 writeFileSync(target,JSON.stringify(payload));
 console.log(JSON.stringify({records:details.length,fields:details.reduce((n,d)=>n+d.fields.length,0),pages:readdirSync(join(output,'pages')).length,bytes:readFileSync(target).length}));
 service.db.close();
} finally {rmSync(temp,{recursive:true,force:true});}
