import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {handleApi} from '../functions/api/[[path]].js';
const env={FIREBASE_API_KEY:'public-key',FIREBASE_AUTH_DOMAIN:'aquavita-test.firebaseapp.com',FIREBASE_PROJECT_ID:'aquavita-test',FIREBASE_APP_ID:'1:234:web:abc',FIREBASE_OWNER_UID:'owner-12345'};
const request=(path,method='GET',body,token)=>new Request('https://aquavita.pages.dev'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
const enc=(v)=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=enc({alg:'RS256',typ:'JWT'})+'.'+enc({aud:'aquavita-test',sub:'owner-12345',auth_time:2000000000})+'.signature';
const admin=enc({alg:'RS256',typ:'JWT'})+'.'+enc({aud:'aquavita-test',sub:'admin-12345',auth_time:2000000000})+'.signature';
const sessionFetch=globalThis.fetch;
function mockFirebase(){globalThis.fetch=async()=>Response.json({users:[{localId:'owner-12345',email:'owner@example.com',emailVerified:true,validSince:'100'}]});}
function makePool(db){return {query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release:()=>{}})}}
test('Pages: Firebase config and JSON health routes are nonempty',async()=>{
 const r=await handleApi(request('/api/auth/config'),env,null);assert.equal(r.status,200);assert.equal((await r.json()).configured,true);
 const h=await handleApi(request('/api/health'),env,null);assert.equal((await h.json()).database,'not_configured');
});
test('Pages: owner cannot access database routes without Firebase or Neon',async()=>{
 const db=new PGlite();await db.exec(await readFile(new URL('../database/schema.sql',import.meta.url),'utf8'));
 try{
 const unauth=await assert.rejects(()=>handleApi(request('/api/me'),env,makePool(db)),/Please sign in/);
 mockFirebase();
 const me=await handleApi(request('/api/me','GET',null,token),env,makePool(db));assert.equal((await me.json()).role,'owner');
 const r=await handleApi(request('/api/admin/locations','POST',{id:'S99',name:'Test Lab',kind:'academic',name_bn:'',sort_order:3},token),env,makePool(db));assert.equal(r.status,201);
 const d=await r.json();assert.equal(d.id,'S99');
 const loc=await handleApi(request('/api/locations'),env,makePool(db));assert.equal((await loc.json())[0].id,'S99');
 const updated=await handleApi(request('/api/admin/locations/S99','PUT',{id:'S99',name:'Updated Lab',kind:'academic',name_bn:'',sort_order:3,revision:d.revision},token),env,makePool(db));assert.equal((await updated.json()).name,'Updated Lab');
 const denied=await handleApi(request('/api/admin/users','GET',null,token),env,makePool(db)).catch(e=>e);assert.equal(denied.status,501);
 }finally{globalThis.fetch=sessionFetch;await db.close()}
});
