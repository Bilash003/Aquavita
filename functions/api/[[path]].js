// AquaVita Cloudflare Pages API adapter. All routes return JSON errors instead of HTML.
// Uses the project's existing validation rules and pg client; no Firebase private key in the browser.
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {locations as fallbackLocations} from '../../dist/data.js';
import {defaultSettings} from '../../dist/settings-defaults.js';
import {validate,fail,identifyImage} from '../../backend/validation.js';

const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const err=(message,status=400)=>fail(message,status);
const reqBody=async(req)=>{
  if(Number(req.headers.get('content-length')||0)>1048576)err('Request body is too large',413);
  const text=await req.text(); if(text.length>1048576)err('Request body is too large',413);
  try { const v=JSON.parse(text); if(!v||typeof v!=='object'||Array.isArray(v))throw Error(); return v; }
  catch { err('Expected a valid JSON object in request body',400); }
};
const routeId=(path,prefix)=>path.startsWith(prefix+'/')?decodeURIComponent(path.slice(prefix.length+1)):null;
const userConfig=env=>({apiKey:env.FIREBASE_API_KEY||'',authDomain:env.FIREBASE_AUTH_DOMAIN||'',projectId:env.FIREBASE_PROJECT_ID||'',appId:env.FIREBASE_APP_ID||''});
const readyFirebase=env=>['FIREBASE_API_KEY','FIREBASE_AUTH_DOMAIN','FIREBASE_PROJECT_ID','FIREBASE_APP_ID'].every(k=>!!env[k]);
const needDb=pool=>{if(!pool)err('Neon database is not configured. Add DATABASE_URL in Cloudflare Pages settings.',503)};
const q=async(pool,sql,args=[])=>{needDb(pool);return pool.query(sql,args)};
const tx=async(pool,fn)=>{const client=await pool.connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}};
const log=async(c,user,action,entity,id)=>c.query('INSERT INTO audit_log(actor_uid,actor_email,action,entity,entity_id) VALUES($1,$2,$3,$4,$5)',[user.uid,user.email||'',action,entity,String(id)]);

// Firebase's accounts:lookup endpoint validates the ID token against Google's service.
// Recheck account state and validSince, not just the unverified browser-provided role.
async function identifyUser(req,env,pool){
  if(!env.FIREBASE_API_KEY||!env.FIREBASE_PROJECT_ID)err('Firebase has not been configured on Cloudflare Pages.',503);
  const match=req.headers.get('Authorization')?.match(/^Bearer\s+([^\s]+)$/i);
  if(!match)err('Please sign in to continue.',401);
  let resp,details;
  try{
    resp=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(env.FIREBASE_API_KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:match[1]})
    });
    details=await resp.json();
  }catch{err('Firebase verification service is temporarily unavailable.',503)}
  const user=details?.users?.[0];
  if(!resp.ok||!user||!user.localId)err('Invalid or expired Firebase session. Sign in again.',401);
  if(user.disabled)err('This Firebase account is disabled.',403);
  // accounts:lookup verifies the signature; compare to validSince to reject revoked credentials.
  try{
    const payload=JSON.parse(atob(match[1].split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    if(payload.aud!==env.FIREBASE_PROJECT_ID||payload.sub!==user.localId)err('Invalid Firebase project or session.',401);
    if(Number(payload.auth_time||0)<Number(user.validSince||0))err('Your session has been revoked. Sign in again.',401);
  }catch(e){if(e.status)throw e;err('Invalid Firebase token.',401)}
  if(!user.emailVerified)err('Verify your email address before opening the admin dashboard.',403);
  needDb(pool);
  const role=user.localId===env.FIREBASE_OWNER_UID?'owner':(await q(pool,'SELECT uid FROM admins WHERE uid=$1',[user.localId])).rowCount?'admin':'viewer';
  return {uid:user.localId,email:user.email||'',role};
}

function databaseError(e){
  const status=e.status||({'23503':409,'23505':409,'23514':400,'22P02':400,'22P03':400}[e.code])||500;
  const desc=e.code==='23503'?'Related records prevent this operation. Remove dependent records first.':e.code==='23505'?'An item with this ID already exists.':status>=500?'An API or database error occurred. Check Cloudflare function logs and Neon setup.':e.message;
  if(status>=500)console.error('AquaVita API failed',e?.code||e?.name,e?.message);
  return json({error:desc},status);
}

export async function handleApi(request,env,pool){
 const {pathname,searchParams}=new URL(request.url),method=request.method;
 if(pathname==='/api/health'&&method==='GET')return json({status:'ok',database:pool?'configured':'not_configured',authentication:readyFirebase(env)?'configured':'not_configured'});
 if(pathname==='/api/auth/config'&&method==='GET')return json({configured:readyFirebase(env),firebase:userConfig(env)});
 if(pathname==='/api/settings'&&method==='GET')return json(pool?{...defaultSettings,...(await q(pool,'SELECT data FROM site_settings WHERE id=1')).rows[0]?.data}:defaultSettings);
 if(pathname==='/api/locations'&&method==='GET'){
  if(!pool)return json(fallbackLocations);
  const l=await q(pool,'SELECT * FROM locations ORDER BY sort_order,name'),s=await q(pool,'SELECT * FROM sources ORDER BY sort_order,code');
  return json(l.rows.map(l=>({...l,sources:s.rows.filter(s=>s.location_id===l.id).map(s=>s.code),source_details:s.rows.filter(s=>s.location_id===l.id)})));
 }
 if(pathname==='/api/summary'&&method==='GET'){
  if(!pool)return json({report_count:0,sources:[]});
  const r=await q(pool,'SELECT source_code,COUNT(*)::integer AS count FROM reports WHERE is_published=TRUE GROUP BY source_code');
  return json({report_count:r.rows.reduce((n,s)=>n+s.count,0),sources:r.rows});
 }
 if(pathname.startsWith('/api/sources/')&&pathname.endsWith('/reports')&&method==='GET'){
  if(!pool)return json([]);
  const code=decodeURIComponent(pathname.slice('/api/sources/'.length,-'/reports'.length));
  if(!(await q(pool,'SELECT 1 FROM sources WHERE code=$1',[code])).rowCount)err('Source not found',404);
  return json((await q(pool,'SELECT * FROM reports WHERE source_code=$1 AND is_published=TRUE ORDER BY COALESCE(tested_at,sampled_at) DESC NULLS LAST,id DESC',[code])).rows);
 }
 if(pathname.startsWith('/api/media/')&&method==='GET'){
  const id=routeId(pathname,'/api/media');if(!/^[a-f0-9-]{36}$/.test(id))err('Image not found',404);
  const r=await q(pool,'SELECT bytes,mime_type FROM media WHERE id=$1',[id]);if(!r.rowCount)err('Image not found',404);
  return new Response(r.rows[0].bytes,{headers:{'Content-Type':r.rows[0].mime_type,'Cache-Control':'public,max-age=86400','X-Content-Type-Options':'nosniff'}});
 }
 if(pathname==='/api/problem-reports'){
  if(method==='GET')return json(pool?(await q(pool,"SELECT id,reporter_name,reporter_id,location_or_source,problem_type,description,status,created_at,verified_at FROM problem_reports WHERE status='verified' ORDER BY created_at DESC")).rows:[]);
  if(method==='POST'){
   const data=validate('problem_reports',await reqBody(request));
   const r=await q(pool,"INSERT INTO problem_reports(reporter_name,reporter_id,location_or_source,problem_type,description,status) VALUES($1,$2,$3,$4,$5,'pending') RETURNING id,created_at",Object.values(data));
   return json({success:true,...r.rows[0]},201);
  }
 }
 if(pathname!=='/api/me'&&!pathname.startsWith('/api/admin/'))err('API endpoint not found',404);
 const user=await identifyUser(request,env,pool);
 if(pathname==='/api/me'&&method==='GET')return json(user);
 if(user.role==='viewer')err('This account has not been granted administrator access.',403);

 if(pathname==='/api/admin/overview'&&method==='GET')return json((await q(pool,`SELECT (SELECT COUNT(*)::int FROM locations) AS buildings,(SELECT COUNT(*)::int FROM sources) AS sources,(SELECT COUNT(*)::int FROM reports) AS reports,(SELECT COUNT(*)::int FROM reports WHERE NOT is_published) AS drafts,(SELECT COUNT(*)::int FROM problem_reports WHERE status='pending') AS pending_problems`)).rows[0]);
 for(const table of ['locations','sources','reports']){
  const prefix='/api/admin/'+table,pk=table==='locations'?'id':table==='sources'?'code':'id';
  if(pathname===prefix&&method==='GET')return json((await q(pool,`SELECT * FROM ${table} ORDER BY ${table==='reports'?'id DESC':table==='locations'?'sort_order,name':'sort_order,code'}`)).rows);
  if(pathname===prefix&&method==='POST'){
   const data=validate(table,await reqBody(request)),keys=Object.keys(data);
   const row=await tx(pool,async c=>{const r=await c.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(data));await log(c,user,'create',table,r.rows[0][pk]);return r.rows[0]});return json(row,201);
  }
  const id=routeId(pathname,prefix);if(id===null||id.includes('/'))continue;
  if(method==='PUT'){
   const body=await reqBody(request),data=validate(table,body);
   if(table==='locations'&&data.id!==id)err('Building ID cannot be changed; edit its name instead.');
   if(!Number.isInteger(body.revision))err('Reload this record before editing.');
   const keys=Object.keys(data),row=await tx(pool,async c=>{const r=await c.query(`UPDATE ${table} SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')},revision=revision+1 WHERE ${pk}=$${keys.length+1} AND revision=$${keys.length+2} RETURNING *`,[...Object.values(data),id,body.revision]);if(!r.rowCount)err('This record changed or was deleted. Reload before saving.',409);await log(c,user,'update',table,r.rows[0][pk]);return r.rows[0]});return json(row);
  }
  if(method==='DELETE'){
   const body=await reqBody(request);if(!Number.isInteger(body.revision))err('Reload this record before deleting.');
   await tx(pool,async c=>{const r=await c.query(`DELETE FROM ${table} WHERE ${pk}=$1 AND revision=$2 RETURNING ${pk}`,[id,body.revision]);if(!r.rowCount)err('This record changed or was deleted. Reload first.',409);await log(c,user,'delete',table,id)});return json({deleted:true});
  }
 }
 if(pathname==='/api/admin/problem-reports'&&method==='GET')return json((await q(pool,"SELECT * FROM problem_reports ORDER BY CASE WHEN status='pending' THEN 0 WHEN status='verified' THEN 1 ELSE 2 END, created_at DESC")).rows);
 const problemId=routeId(pathname,'/api/admin/problem-reports');
 if(problemId){const pieces=problemId.split('/');if(!/^\d+$/.test(pieces[0]))err('Invalid problem report ID');const id=Number(pieces[0]);
  if(method==='PUT'&&pieces[1]==='verify'){
   const body=await reqBody(request),status=['verified','rejected','pending'].includes(body.status)?body.status:'verified';
   const result=await tx(pool,async c=>{const r=await c.query('UPDATE problem_reports SET status=$1,verified_at=$2,verified_by=$3 WHERE id=$4 RETURNING *',[status,status==='pending'?null:new Date(),status==='pending'?'':user.email||user.uid,id]);if(!r.rowCount)err('Problem report not found',404);await log(c,user,status==='verified'?'verify':status==='rejected'?'reject':'reset_pending','problem_reports',id);return r.rows[0]});return json(result);
  }
  if(method==='DELETE'&&pieces.length===1){await tx(pool,async c=>{const r=await c.query('DELETE FROM problem_reports WHERE id=$1 RETURNING id',[id]);if(!r.rowCount)err('Problem report not found',404);await log(c,user,'delete','problem_reports',id)});return json({deleted:true});}
 }
 if(pathname==='/api/admin/settings'){
  if(method==='GET'){const r=(await q(pool,'SELECT * FROM site_settings WHERE id=1')).rows[0];if(!r)err('Run database initialization to create site settings.',503);return json({data:{...defaultSettings,...r.data},revision:r.revision})}
  if(method==='PUT'){
   const body=await reqBody(request),data=validate('settings',body.data);if(!Number.isInteger(body.revision))err('Reload settings first');
   const result=await tx(pool,async c=>{const r=await c.query('UPDATE site_settings SET data=$1,revision=revision+1 WHERE id=1 AND revision=$2 RETURNING *',[JSON.stringify(data),body.revision]);if(!r.rowCount)err('Settings changed. Reload before saving.',409);await log(c,user,'update','settings',1);return r.rows[0]});return json(result);
  }
 }
 if(pathname==='/api/admin/media'){
  if(method==='GET')return json((await q(pool,'SELECT id,filename,mime_type,size,created_at FROM media ORDER BY created_at DESC')).rows.map(r=>({...r,url:`/api/media/${r.id}`})));
  if(method==='POST'){
   if(Number(request.headers.get('content-length')||0)>5242880)err('Image cannot exceed 5 MB',413);
   const bytes=Buffer.from(await request.arrayBuffer());const mime=identifyImage(bytes),id=randomUUID();
   let filename;try{filename=decodeURIComponent(request.headers.get('x-file-name')||'sample').slice(0,200)}catch{err('Invalid filename')}
   await tx(pool,async c=>{await c.query('INSERT INTO media(id,filename,mime_type,bytes,size) VALUES($1,$2,$3,$4,$5)',[id,filename,mime,bytes,bytes.length]);await log(c,user,'upload','media',id)});
   return json({id,url:`/api/media/${id}`,filename},201);
  }
 }
 const mediaId=routeId(pathname,'/api/admin/media');
 if(mediaId&&method==='DELETE'&&/^[a-f0-9-]{36}$/.test(mediaId)){
  const url=`/api/media/${mediaId}`;await tx(pool,async c=>{const refs=await c.query("SELECT 1 FROM reports WHERE photo_url=$1 UNION ALL SELECT 1 FROM site_settings WHERE data->>'logo_url'=$1",[url]);if(refs.rowCount)err('This image is used in a report or site logo.',409);const r=await c.query('DELETE FROM media WHERE id=$1 RETURNING id',[mediaId]);if(!r.rowCount)err('Image not found',404);await log(c,user,'delete','media',mediaId)});return json({deleted:true});
 }
 if(pathname==='/api/admin/audit'&&method==='GET')return json((await q(pool,'SELECT * FROM audit_log ORDER BY id DESC LIMIT 200')).rows);
 if(pathname==='/api/admin/export'&&method==='GET'){
  const result={exported_at:new Date().toISOString(),images:'Image files not embedded. Download them separately.'};for(const table of ['locations','sources','reports','site_settings','problem_reports'])result[table]=(await q(pool,`SELECT * FROM ${table}`)).rows;return json(result);
 }
 if(pathname==='/api/admin/admins'){
  if(user.role!=='owner')err('Only the owner may manage other administrators.',403);
  if(method==='GET')return json({owner_uid:env.FIREBASE_OWNER_UID,admins:(await q(pool,'SELECT * FROM admins ORDER BY created_at DESC')).rows});
  if(method==='POST'){
   const body=await reqBody(request),uid=body.uid;if(typeof uid!=='string'||uid.length<5||uid.length>128)err('Enter a valid Firebase UID');
   // Only the owner can grant a UID. Every subsequent admin request revalidates the Firebase account and email.
   await tx(pool,async c=>{await c.query('INSERT INTO admins(uid,email) VALUES($1,$2) ON CONFLICT(uid) DO UPDATE SET email=excluded.email',[uid,'']);await log(c,user,'grant','admins',uid)});return json({uid},201);
  }
 }
 const adminUid=routeId(pathname,'/api/admin/admins');
 if(adminUid&&method==='DELETE'){
  if(user.role!=='owner')err('Only the owner may manage other administrators.',403);
  if(adminUid===env.FIREBASE_OWNER_UID)err('Owner is managed through server configuration.',400);
  await tx(pool,async c=>{await c.query('DELETE FROM admins WHERE uid=$1',[adminUid]);await log(c,user,'revoke','admins',adminUid)});return json({deleted:true});
 }
 if(pathname.startsWith('/api/admin/users'))err('User-account provisioning on Pages requires a separate Firebase Admin REST integration. Manage users in Firebase Console for now.',501);
 err('API endpoint not found',404);
}

export async function onRequest(context){
 const env=context.env||{};
 let pool=null;
 // On Cloudflare, create a short-lived pg pool per request, never a globally shared TCP client.
 if(env.DATABASE_URL)pool=new pg.Pool({connectionString:env.DATABASE_URL,max:1,connectionTimeoutMillis:8000,idleTimeoutMillis:1000});
 try{return await handleApi(context.request,env,pool)}
 catch(e){return databaseError(e)}
 finally{if(pool)await pool.end().catch(()=>{})}
}
