/** Opt-in local identities. No hosted identity-provider or public deployment claim. */
import {randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import type {IncomingMessage} from 'node:http';
import type {DatabaseSync} from 'node:sqlite';

export const LOCAL_AUTH_SCHEMA=`
CREATE TABLE IF NOT EXISTS local_users (
 id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_salt TEXT NOT NULL, password_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL, disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)));
CREATE TABLE IF NOT EXISTS local_memberships (
 user_id INTEGER NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
 organization_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('analyst','director')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 PRIMARY KEY(user_id,organization_id));
CREATE TABLE IF NOT EXISTS local_sessions (
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
 organization_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 FOREIGN KEY(user_id,organization_id) REFERENCES local_memberships(user_id,organization_id));
CREATE TABLE IF NOT EXISTS login_throttle (
 email TEXT PRIMARY KEY COLLATE NOCASE, failures INTEGER NOT NULL,
 first_attempt INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS local_sessions_expiry ON local_sessions(expires_at);
`;

const problem=(message:string,status=401)=>Object.assign(new Error(message),{status});
export function normalizeEmail(email:unknown){
 if(typeof email!=='string')return '';
 const value=email.trim().toLowerCase();
 return value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)?value:'';
}
function passwordDigest(password:string,salt:Buffer){return scryptSync(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});}
export function provisionLocalUser(db:DatabaseSync,args:{email:string,password:string,organization:string,role:'analyst'|'director'}){
 const email=normalizeEmail(args.email);
 if(!email||args.password.length<12||args.password.length>512||!/^[-a-z0-9_]{3,80}$/i.test(args.organization)||!['analyst','director'].includes(args.role))
  throw new Error('Valid email, password of 12–512 characters, organization slug, and role required');
 if(db.prepare('SELECT id FROM local_users WHERE email=?').get(email))throw new Error('Account exists; provisioning never replaces an existing password');
 const salt=randomBytes(24);const hash=passwordDigest(args.password,salt);
 db.exec('BEGIN IMMEDIATE');
 try{
  const id=Number(db.prepare('INSERT INTO local_users(email,password_salt,password_hash,created_at) VALUES(?,?,?,?)')
   .run(email,salt.toString('hex'),hash.toString('hex'),Date.now()).lastInsertRowid);
  db.prepare('INSERT INTO local_memberships(user_id,organization_id,role) VALUES(?,?,?)').run(id,args.organization,args.role);
  db.exec('COMMIT');return {id,email,organization:args.organization,role:args.role};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
const UNKNOWN_SALT=Buffer.from('4bd3f2b441db7c6420e1a1e3f4be221da7bd130bfb912486','hex');
const UNKNOWN_HASH=passwordDigest('not-a-real-account-password',UNKNOWN_SALT);
export function loginLocal(db:DatabaseSync,emailInput:unknown,passwordInput:unknown,now=Date.now()){
 const email=normalizeEmail(emailInput);
 const password=typeof passwordInput==='string'?passwordInput:'';
 const invalid=()=>problem('Invalid credentials',401);
 // Bound expensive derivation and avoid malformed or unbounded input.
 if(!email||password.length<1||password.length>512)throw invalid();
 const throttle=db.prepare('SELECT * FROM login_throttle WHERE email=?').get(email) as any;
 if(throttle?.locked_until>now)throw problem('Too many attempts; try again later',429);
 const user=db.prepare('SELECT * FROM local_users WHERE email=? AND disabled=0').get(email) as any;
 const salt=user?Buffer.from(user.password_salt,'hex'):UNKNOWN_SALT;
 const expected=user?Buffer.from(user.password_hash,'hex'):UNKNOWN_HASH;
 const actual=passwordDigest(password,salt);
 const correct=expected.length===actual.length && timingSafeEqual(expected,actual);
 const membership=user?(db.prepare('SELECT organization_id,role FROM local_memberships WHERE user_id=? AND active=1 ORDER BY organization_id LIMIT 1').get(user.id) as any):null;
 if(!correct||!membership){
  const failures=throttle&&now-throttle.first_attempt<15*60*1000?throttle.failures+1:1;
  const first=failures===1?now:throttle.first_attempt;
  db.prepare(`INSERT INTO login_throttle(email,failures,first_attempt,locked_until) VALUES(?,?,?,?)
   ON CONFLICT(email) DO UPDATE SET failures=excluded.failures,first_attempt=excluded.first_attempt,locked_until=excluded.locked_until`)
   .run(email,failures,first,failures>=5?now+15*60*1000:0);
  throw invalid();
 }
 db.prepare('DELETE FROM login_throttle WHERE email=?').run(email);
 db.prepare('DELETE FROM local_sessions WHERE expires_at<=?').run(now);
 const token=randomBytes(32).toString('base64url');const tokenHash=createHash('sha256').update(token).digest('hex');
 db.prepare('INSERT INTO local_sessions(token_hash,user_id,organization_id,created_at,expires_at) VALUES(?,?,?,?,?)')
  .run(tokenHash,user.id,membership.organization_id,now,now+12*60*60*1000);
 return {token,actor:{name:user.email,organization:membership.organization_id,role:membership.role},expiresAt:now+12*60*60*1000};
}
export function readCookies(req:IncomingMessage){
 const cookies:Record<string,string>={};
 for(const part of String(req.headers.cookie||'').split(';')){
  const index=part.indexOf('=');if(index<1)continue;
  const name=part.slice(0,index).trim();const value=part.slice(index+1).trim();
  if(/^[A-Za-z_][A-Za-z_0-9-]*$/.test(name)&&value.length<512)cookies[name]=value;
 }
 return cookies;
}
export function localActor(db:DatabaseSync,req:IncomingMessage,now=Date.now()){
 if(req.headers['x-demo-user'])throw problem('Demo impersonation header is unavailable',403);
 const token=readCookies(req).harbor_session;
 if(!token||!(/^[A-Za-z0-9_-]{43}$/.test(token)))throw problem('Authentication required');
 const hash=createHash('sha256').update(token).digest('hex');
 const row=db.prepare(`SELECT u.email AS name,m.organization_id AS organization,m.role
  FROM local_sessions s JOIN local_users u ON u.id=s.user_id AND u.disabled=0
  JOIN local_memberships m ON m.user_id=s.user_id AND m.organization_id=s.organization_id AND m.active=1
  WHERE s.token_hash=? AND s.expires_at>?`).get(hash,now) as any;
 if(!row)throw problem('Authentication required');
 return {name:row.name,organization:row.organization,role:row.role};
}
export function logoutLocal(db:DatabaseSync,req:IncomingMessage){
 const token=readCookies(req).harbor_session;
 if(token&&/^[A-Za-z0-9_-]{43}$/.test(token))
  db.prepare('DELETE FROM local_sessions WHERE token_hash=?').run(createHash('sha256').update(token).digest('hex'));
}
