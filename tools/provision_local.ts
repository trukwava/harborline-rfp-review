/** Run offline using env secrets, never command-line password arguments or seed credentials. */
import {resolve,join} from 'node:path';
import {openDb} from '../src/db.ts';
import {provisionLocalUser} from '../src/auth.ts';
const email=process.env.HARBOR_USER_EMAIL||'';
const password=process.env.HARBOR_USER_PASSWORD||'';
const organization=process.env.HARBOR_ORGANIZATION||'harbor-local';
const role=process.env.HARBOR_USER_ROLE==='analyst'?'analyst':'director';
if(!email||!password){console.error('Set HARBOR_USER_EMAIL and HARBOR_USER_PASSWORD in the environment before provisioning.');process.exitCode=1;}
else {
 const dir=resolve(process.env.DATA_DIR||join(process.cwd(),'data'));
 const db=openDb(join(dir,'review.sqlite'));
 try{const user=provisionLocalUser(db,{email,password,organization,role});console.log(`Provisioned ${user.email} for ${user.organization} (${user.role}); password not displayed.`);}
 catch(e){console.error('Provisioning failed:',(e as Error).message);process.exitCode=1;}finally{db.close();}
}
