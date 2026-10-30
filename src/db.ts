import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

export const SCHEMA = `
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS organization_profile_versions (
 id INTEGER PRIMARY KEY, organization_id TEXT NOT NULL, version INTEGER NOT NULL, data_json TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(organization_id,version));
CREATE TABLE IF NOT EXISTS opportunities (
 id INTEGER PRIMARY KEY, organization_id TEXT NOT NULL, title TEXT NOT NULL, issuer TEXT NOT NULL,
 source_url TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(organization_id,title,issuer));
CREATE TABLE IF NOT EXISTS source_document_versions (
 id INTEGER PRIMARY KEY, opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('base','amendment','attachment')),
 sha256 TEXT NOT NULL, filename TEXT NOT NULL, file_path TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(opportunity_id,sha256));
CREATE TABLE IF NOT EXISTS source_pages (
 id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES source_document_versions(id) ON DELETE CASCADE,
 page_index INTEGER NOT NULL, printed_label TEXT, body TEXT NOT NULL, method TEXT NOT NULL,
 warning TEXT, preview_path TEXT, UNIQUE(document_id,page_index));
CREATE TABLE IF NOT EXISTS ingestion_runs (
 id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES source_document_versions(id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('completed','failed')), error TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS citations (
 id INTEGER PRIMARY KEY, page_id INTEGER NOT NULL REFERENCES source_pages(id), excerpt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS extracted_field_candidates (
 id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES ingestion_runs(id) ON DELETE CASCADE,
 field_key TEXT NOT NULL, value TEXT NOT NULL, raw_value TEXT NOT NULL,
 citation_id INTEGER NOT NULL REFERENCES citations(id), created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(run_id,field_key));
CREATE TABLE IF NOT EXISTS field_reviews (
 id INTEGER PRIMARY KEY, opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
 field_key TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('confirmed','edited','missing','rejected')),
 value TEXT, based_on_candidate_id INTEGER REFERENCES extracted_field_candidates(id),
 needs_rereview INTEGER NOT NULL DEFAULT 0 CHECK(needs_rereview IN (0,1)),
 reviewer TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(opportunity_id,field_key));
CREATE TABLE IF NOT EXISTS eligibility_criteria (
 id INTEGER PRIMARY KEY, opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
 field_key TEXT NOT NULL, requirement TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pass','fail','unknown')),
 source_citation_id INTEGER REFERENCES citations(id), org_profile_version_id INTEGER NOT NULL REFERENCES organization_profile_versions(id),
 org_evidence TEXT NOT NULL, explanation TEXT NOT NULL, UNIQUE(opportunity_id,field_key));
CREATE TABLE IF NOT EXISTS review_decisions (
 id INTEGER PRIMARY KEY, opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
 decision TEXT NOT NULL CHECK(decision IN ('pursue','decline','needs_discussion')),
 rationale TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS deadlines (
 id INTEGER PRIMARY KEY, opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
 field_key TEXT NOT NULL, original TEXT NOT NULL, normalized TEXT, kind TEXT NOT NULL,
 timezone TEXT, source_citation_id INTEGER NOT NULL REFERENCES citations(id), UNIQUE(opportunity_id,field_key));
CREATE TABLE IF NOT EXISTS audit_events (
 id INTEGER PRIMARY KEY, opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE CASCADE,
 actor TEXT NOT NULL, event_type TEXT NOT NULL, payload_json TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now')));
`;
export function openDb(path:string):DatabaseSync {
 mkdirSync(dirname(path),{recursive:true});
 const db=new DatabaseSync(path);db.exec(SCHEMA);return db;
}
export function tx<T>(db:DatabaseSync,fn:()=>T):T{
 db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}
}
