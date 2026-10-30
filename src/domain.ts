/** Deterministic, untrusted-document -> evidence-backed candidate rules. No LLM output controls state. */
export const FIELDS = [
 ['title','Opportunity title'], ['issuer','Issuer / funder'], ['identifier','Identifier'],
 ['program_purpose','Program purpose'], ['eligible_applicants','Eligible applicants'],
 ['geography','Geography'], ['populations_served','Populations served'],
 ['award_minimum','Award minimum'], ['award_maximum','Award maximum'],
 ['estimated_awards','Estimated awards'], ['match_requirement','Match requirement'],
 ['project_period','Project period'], ['submission_deadline','Submission deadline'],
 ['question_deadline','Question deadline'], ['submission_method','Submission method'],
 ['required_registrations','Required registrations / credentials'],
 ['mandatory_attachments','Mandatory attachments'], ['mandatory_activities','Mandatory activities'],
 ['deliverables','Deliverables'], ['evaluation_criteria','Evaluation criteria'],
 ['restrictions','Restrictions'], ['contact_details','Contact details'],
 ['unresolved_questions','Unresolved questions']
] as const;
export type FieldKey = (typeof FIELDS)[number][0];
export const FIELD_KEYS = new Set<string>(FIELDS.map(x=>x[0]));
export const LABEL_TO_KEY = new Map<string,string>(FIELDS.map(([key,label])=>[key.replaceAll('_',' '),key]));
LABEL_TO_KEY.set('required registrations','required_registrations');
LABEL_TO_KEY.set('opportunity title','title');
LABEL_TO_KEY.set('issuer','issuer');
LABEL_TO_KEY.set('title','title');
LABEL_TO_KEY.set('identifier','identifier');
LABEL_TO_KEY.set('required registrations / credentials','required_registrations');

export type Page = { index:number; printed_label:string|null; text:string; method:string; warning:string|null; };
export type Extraction = {key:string; value:string; raw:string; excerpt:string; pageIndex:number};

/** Only anchored key-value lines may become candidates; other text (incl. prompt injection) is inert. */
export function extractCandidates(pages:Page[],role:string):Extraction[] {
 const result:Extraction[]=[]; const seen=new Set<string>();
 for(const page of pages){
  for(const line of page.text.split(/\r?\n/)){
   const match=line.trim().match(/^([a-z][a-z\s/]+):\s*(\S.*)$/i);
   if(!match)continue;
   const key=LABEL_TO_KEY.get(match[1].trim().toLowerCase());
   if(!key || seen.has(key))continue;
   const value=match[2].trim();
   if(!value || value.length>1200)continue;
   if(role==='amendment' && ((key==='title' && /addendum|amendment/i.test(value)) || key==='identifier'))continue;
   // The citation is the actual line in the original page text, not fabricated by the extractor.
   const excerpt=line.trim();
   if(!page.text.includes(excerpt))continue;
   result.push({key,value,raw:value,excerpt,pageIndex:page.index});seen.add(key);
  }
 }
 return result;
}

/** Preserve original wording; exact-instant vs date-only deadlines are distinct. */
export function normalizeDeadline(raw:string): {kind:'instant'|'date'|'unparsed';iso:string|null;zone:string|null;original:string} {
 const months:Record<string,number>={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
 const re=/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM|a\.m\.|p\.m\.)?)?/i;
 const m=raw.match(re);
 if(!m)return {kind:'unparsed',iso:null,zone:null,original:raw};
 const year=Number(m[3]),month=months[m[1].toLowerCase()],day=Number(m[2]);
 if(month<1||day<1||day>31||new Date(Date.UTC(year,month-1,day)).getUTCDate()!==day)return {kind:'unparsed',iso:null,zone:null,original:raw};
 const local=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
 if(!m[4])return {kind:'date',iso:local,zone:null,original:raw};
 let hh=Number(m[4]),minute=Number(m[5]??0),ap=m[6]?.toUpperCase().replaceAll('.','');
 if(minute>59||hh<0||hh>23 || (ap && (hh<1||hh>12)))return {kind:'unparsed',iso:null,zone:null,original:raw};
 if(ap)hh=hh%12+(ap==='PM'?12:0);
 const zone=raw.match(/America\/New_York/)?.[0]??null;
 if(!zone)return {kind:'unparsed',iso:null,zone:null,original:raw};
 // Offset is derived by Intl from this date, accounting for DST, not hardcoded year-round.
 const approx=new Date(Date.UTC(year,month-1,day,hh,minute));
 const offsetText=new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'shortOffset'}).formatToParts(approx).find(p=>p.type==='timeZoneName')?.value??'';
 const om=offsetText.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
 if(!om)return {kind:'unparsed',iso:null,zone:null,original:raw};
 const offset=(om[1]==='+'?1:-1)*(Number(om[2])*60+Number(om[3]??0));
 const instant=new Date(Date.UTC(year,month-1,day,hh,minute)-offset*60000).toISOString();
 return {kind:'instant',iso:instant,zone,original:raw};
}

export type OrganizationProfile = {name:string;version:number;mission:string;geography:string;credentials:string[];negative_evidence:string[];notes:string};
export type Eligibility = {requirement:string;status:'pass'|'fail'|'unknown';orgEvidence:string;explanation:string};
export function compareRequirement(key:string, requirement:string, profile:OrganizationProfile):Eligibility {
 const t=requirement.toLowerCase();const credentials=profile.credentials.map(x=>x.toLowerCase());
 const neg=profile.negative_evidence.map(x=>x.toLowerCase());
 if(/hud[- ]approved/.test(t)){
  const satisfied=credentials.some(x=>x.includes('hud-approved'));
  const contradicted=neg.some(x=>x.includes('hud-approved'));
  return {requirement,status:satisfied?'pass':contradicted?'fail':'unknown',orgEvidence:satisfied?'Profile lists HUD-approved housing counseling agency':contradicted?'Profile explicitly states credential not held':'No credential evidence in profile',explanation:'Credential requires affirmative documentary verification; silence is unknown.'};
 }
 if(/501\(c\)\(3\)/.test(t)){
  const yes=credentials.some(x=>x.includes('501(c)(3)'));
  const no=neg.some(x=>x.includes('501(c)(3)'));
  return {requirement,status:yes?'pass':no?'fail':'unknown',orgEvidence:yes?'Profile lists 501(c)(3) recognition':no?'Profile explicitly denies 501(c)(3)':'No 501(c)(3) evidence',explanation:'Declared profile only; verify supporting documentation.'};
 }
 if(key==='geography' && /new york city/.test(t)){
  const yes=/new york city/i.test(profile.geography);
  return {requirement,status:yes?'pass':'unknown',orgEvidence:`Profile geography: ${profile.geography || 'not specified'}`,explanation:'Broad geography alignment only; verify finer eligibility restrictions.'};
 }
 return {requirement,status:'unknown',orgEvidence:'No deterministic comparison rule or explicit counterevidence',explanation:'Reviewer assessment required; unknown cannot become pass.'};
}
