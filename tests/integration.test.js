import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApp} from '../backend/app.js';
import {defaultSettings} from '../dist/settings-defaults.js';

// Firebase verification is mocked only here. Production always uses Firebase Admin SDK.
const users={owner:{uid:'owner',email:'owner@example.test',email_verified:true},editor:{uid:'editor',email:'editor@example.test',email_verified:true},viewer:{uid:'viewer',email:'viewer@example.test',email_verified:true},unverified:{uid:'unverified',email:'new@example.test',email_verified:false}};
const fakeAuth={async verifyIdToken(token,revoked){assert.equal(revoked,true);if(!users[token])throw Error('invalid');return users[token]},async getUser(uid){if(!users[uid])throw Error();return{uid,email:users[uid].email,emailVerified:users[uid].email_verified,disabled:false}}};
async function setup(){const db=new PGlite();await db.exec(await readFile(new URL('../database/schema.sql',import.meta.url),'utf8'));const pool={async query(sql,args=[]){const r=await db.query(sql,args);for(const row of r.rows)if(row.bytes instanceof Uint8Array)row.bytes=Buffer.from(row.bytes);return{...r,rowCount:r.rows.length||r.affectedRows||0}},async connect(){return{query:this.query.bind(this),release(){}}}};const server=createApp({pool,auth:fakeAuth,env:{FIREBASE_OWNER_UID:'owner',FIREBASE_API_KEY:'public-config',FIREBASE_AUTH_DOMAIN:'example.firebaseapp.com',FIREBASE_PROJECT_ID:'test'}}).listen(0);await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;async function call(url,{token,method='GET',body,raw=false}={}){const headers={};if(token)headers.Authorization=`Bearer ${token}`;if(body!==undefined)headers['Content-Type']=raw?'application/octet-stream':'application/json';const r=await fetch(base+url,{method,headers,body:body===undefined?undefined:raw?body:JSON.stringify(body)});return{status:r.status,body:r.headers.get('content-type')?.includes('application/json')?await r.json():await r.arrayBuffer()}}return{db,pool,call,close:async()=>{await new Promise(r=>server.close(r));await db.close()}}}

test('Authentication rejects missing, forged, unverified and non-admin identities',async()=>{const s=await setup();try{for(const [token,status]of [[undefined,401],['invalid',401],['unverified',403],['viewer',403]])assert.equal((await s.call('/api/admin/locations',{token})).status,status);assert.equal((await s.call('/api/admin/locations',{token:'owner'})).status,200);const cfg=await s.call('/api/auth/config');assert.equal(cfg.body.configured,true);assert.equal(JSON.stringify(cfg.body).includes('private_key'),false)}finally{await s.close()}});

test('Building/source/report CRUD updates public data, hides drafts, and checks revisions and dependencies',async()=>{const s=await setup();try{
 const loc={id:'test-building',name:'Test Building',name_bn:'পরীক্ষার ভবন',kind:'ACADEMIC',sort_order:1};let r=await s.call('/api/admin/locations',{token:'owner',method:'POST',body:loc});assert.equal(r.status,201);assert.equal(r.body.revision,1);
 const src={code:'TEST-S01',location_id:loc.id,label:'Ground floor',label_bn:'নিচতলা',sort_order:1};r=await s.call('/api/admin/sources',{token:'owner',method:'POST',body:src});assert.equal(r.status,201);
 let pub=await s.call('/api/locations');assert.equal(pub.body[0].name_bn,loc.name_bn);assert.deepEqual(pub.body[0].sources,['TEST-S01']);
 const report={source_code:src.code,screening_status:'growth_detected',tested_at:'2026-10-11',next_screening_at:'2026-10-18',is_published:false,notes:'Actual sample record for test'};
 r=await s.call('/api/admin/reports',{token:'owner',method:'POST',body:report});assert.equal(r.status,201);const id=r.body.id;
 assert.equal((await s.call('/api/sources/TEST-S01/reports')).body.length,0);
 r=await s.call('/api/admin/reports/'+id,{token:'owner',method:'PUT',body:{...report,is_published:true,revision:1}});assert.equal(r.status,200);
 assert.equal((await s.call('/api/sources/TEST-S01/reports')).body.length,1);assert.equal((await s.call('/api/summary')).body.report_count,1);
 r=await s.call('/api/admin/reports/'+id,{token:'owner',method:'PUT',body:{...report,revision:1}});assert.equal(r.status,409);
 r=await s.call('/api/admin/sources/TEST-S01',{token:'owner',method:'PUT',body:{...src,code:'TEST-RENAMED',revision:1}});assert.equal(r.status,200);
 assert.equal((await s.call('/api/sources/TEST-RENAMED/reports')).body[0].source_code,'TEST-RENAMED');
 assert.equal((await s.call('/api/admin/locations/'+loc.id,{token:'owner',method:'DELETE',body:{revision:1}})).status,409);
 assert.equal((await s.call('/api/admin/sources/TEST-RENAMED',{token:'owner',method:'DELETE',body:{revision:2}})).status,409);
 assert.equal((await s.call('/api/admin/reports/'+id,{token:'owner',method:'DELETE',body:{revision:2}})).status,200);
 assert.equal((await s.call('/api/admin/sources/TEST-RENAMED',{token:'owner',method:'DELETE',body:{revision:2}})).status,200);
 assert.equal((await s.call('/api/admin/locations/'+loc.id,{token:'owner',method:'DELETE',body:{revision:1}})).status,200);
 assert.equal((await s.call('/api/locations')).body.length,0);
 assert((await s.call('/api/admin/audit',{token:'owner'})).body.length>=7);
}finally{await s.close()}});

test('Owner grants/revokes access; admins cannot grant themselves owner privileges',async()=>{const s=await setup();try{
 assert.equal((await s.call('/api/admin/admins',{token:'owner',method:'POST',body:{uid:'editor'}})).status,200);
 assert.equal((await s.call('/api/admin/locations',{token:'editor'})).status,200);
 assert.equal((await s.call('/api/admin/admins',{token:'editor',method:'POST',body:{uid:'viewer'}})).status,403);
 assert.equal((await s.call('/api/admin/admins/editor',{token:'owner',method:'DELETE',body:{}})).status,200);
 assert.equal((await s.call('/api/admin/locations',{token:'editor'})).status,403);
 assert.equal((await s.call('/api/admin/admins/owner',{token:'owner',method:'DELETE',body:{}})).status,400);
}finally{await s.close()}});

test('Settings, media storage, input validation and repeatable migrations',async()=>{const s=await setup();try{
 const invalid=await s.call('/api/admin/reports',{token:'owner',method:'POST',body:{source_code:'x',screening_status:'no_growth',is_published:true,tested_at:'2026-02-30'}});assert.equal(invalid.status,400);
 assert.equal((await s.call('/api/admin/media',{token:'owner',method:'POST',raw:true,body:Buffer.from('<svg onload="alert(1)"></svg>')})).status,400);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XcAAAAASUVORK5CYII=','base64');
 const uploaded=await s.call('/api/admin/media',{token:'owner',method:'POST',raw:true,body:png});assert.equal(uploaded.status,201);
 const retrieved=await s.call(uploaded.body.url);assert.deepEqual(Buffer.from(retrieved.body),png);
 const settings={...defaultSettings,brand:'Test Vita',intro_enabled:false,logo_url:uploaded.body.url,translations_bn:{choose:'ভবন নির্বাচন করুন'}};
 assert.equal((await s.call('/api/admin/settings',{token:'owner',method:'PUT',body:{data:settings,revision:1}})).status,200);
 assert.equal((await s.call('/api/settings')).body.brand,'Test Vita');
 assert.equal((await s.call('/api/admin/media/'+uploaded.body.id,{token:'owner',method:'DELETE',body:{}})).status,409);
 assert.equal((await s.call('/api/admin/settings',{token:'owner',method:'PUT',body:{data:{...settings,logo_url:''},revision:2}})).status,200);
 assert.equal((await s.call('/api/admin/media/'+uploaded.body.id,{token:'owner',method:'DELETE',body:{}})).status,200);
 await s.db.exec(await readFile(new URL('../database/schema.sql',import.meta.url),'utf8'));
 assert.equal((await s.call('/api/settings')).body.brand,'Test Vita');
}finally{await s.close()}});

test('User account management is owner-only and cannot delete or disable the owner',async()=>{const s=await setup();const created=[];fakeAuth.listUsers=async()=>({users:[{uid:'viewer',email:'viewer@example.test',displayName:'Viewer',disabled:false,emailVerified:true,metadata:{creationTime:'2026-10-11'}}]});fakeAuth.createUser=async data=>{assert.equal(data.emailVerified,false);created.push(data);return{uid:'created-user',email:data.email}};fakeAuth.updateUser=async(uid,data)=>{created.push({uid,...data})};fakeAuth.revokeRefreshTokens=async uid=>created.push({revoked:uid});fakeAuth.deleteUser=async uid=>created.push({deleted:uid});try{
 assert.equal((await s.call('/api/admin/users',{token:'viewer'})).status,403);
 assert.equal((await s.call('/api/admin/users',{token:'owner'})).body.users[0].uid,'viewer');
 const r=await s.call('/api/admin/users',{token:'owner',method:'POST',body:{email:'new@example.test',displayName:'New User',password:'strong-temp-pass-123'}});assert.equal(r.status,201);
 assert.equal((await s.call('/api/admin/users/owner',{token:'owner',method:'DELETE'})).status,400);
 assert.equal((await s.call('/api/admin/users/owner',{token:'owner',method:'PUT',body:{displayName:'Changed',disabled:true}})).status,400);
 assert.equal((await s.call('/api/admin/users/viewer',{token:'owner',method:'PUT',body:{displayName:'Updated',disabled:true}})).status,200);assert(created.some(r=>r.revoked==='viewer'));
 assert.equal((await s.call('/api/admin/users/created-user',{token:'owner',method:'DELETE'})).status,200);assert(created.some(r=>r.deleted==='created-user'));
 assert(!(JSON.stringify((await s.call('/api/admin/audit',{token:'owner'})).body).includes('strong-temp-pass')));
}finally{await s.close()}});

test('Problem reports lifecycle: submission, validation, verification, rejection, and deletion',async()=>{const s=await setup();try{
 const bad=await s.call('/api/problem-reports',{method:'POST',body:{reporter_name:'',reporter_id:'123',location_or_source:'Loc',problem_type:'invalid_type'}});assert.equal(bad.status,400);
 const report={reporter_name:'Fatima Rahman',reporter_id:'2024-1234',location_or_source:'YOUNUS-S01',problem_type:'odour',description:'Strange metallic odour noticed at dispenser'};
 const sub=await s.call('/api/problem-reports',{method:'POST',body:report});assert.equal(sub.status,201);assert(sub.body.id);const id=sub.body.id;
 const pub1=await s.call('/api/problem-reports');assert.equal(pub1.status,200);assert.equal(pub1.body.length,0);
 assert.equal((await s.call('/api/admin/problem-reports')).status,401);
 assert.equal((await s.call('/api/admin/problem-reports',{token:'viewer'})).status,403);
 const ov=await s.call('/api/admin/overview',{token:'owner'});assert.equal(ov.body.pending_problems,1);
 const list=await s.call('/api/admin/problem-reports',{token:'owner'});assert.equal(list.body.length,1);assert.equal(list.body[0].status,'pending');assert.equal(list.body[0].reporter_name,'Fatima Rahman');
 const ver=await s.call('/api/admin/problem-reports/'+id+'/verify',{token:'owner',method:'PUT',body:{status:'verified'}});assert.equal(ver.status,200);assert.equal(ver.body.status,'verified');
 const pub2=await s.call('/api/problem-reports');assert.equal(pub2.body.length,1);assert.equal(pub2.body[0].reporter_name,'Fatima Rahman');assert.equal(pub2.body[0].problem_type,'odour');
 const reset=await s.call('/api/admin/problem-reports/'+id+'/verify',{token:'owner',method:'PUT',body:{status:'pending'}});assert.equal(reset.status,200);assert.equal(reset.body.status,'pending');assert.equal((await s.call('/api/problem-reports')).body.length,0);
 const rej=await s.call('/api/admin/problem-reports/'+id+'/verify',{token:'owner',method:'PUT',body:{status:'rejected'}});assert.equal(rej.status,200);assert.equal(rej.body.status,'rejected');assert.equal((await s.call('/api/problem-reports')).body.length,0);
 const del=await s.call('/api/admin/problem-reports/'+id,{token:'owner',method:'DELETE'});assert.equal(del.status,200);assert.equal((await s.call('/api/admin/problem-reports',{token:'owner'})).body.length,0);
}finally{await s.close()}});
