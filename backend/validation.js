import {screeningStatuses} from '../dist/report-view.js';
import {defaultSettings} from '../dist/settings-defaults.js';
export function fail(message,status=400){throw Object.assign(new Error(message),{status})}
const str=(v,k,max=200,required=false)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail(`Invalid ${k}`);return v.trim()};
const integer=(v,k)=>{if(!Number.isInteger(v)||Math.abs(v)>100000)fail(`Invalid ${k}`);return v};
const date=(v,k)=>{if(v==null||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail(`Invalid ${k}`);return v};
export function imageUrl(v){if(!v)return '';str(v,'image URL',2000);if(/^\/api\/media\/[a-f0-9-]{36}$/.test(v))return v;try{const url=new URL(v);if(url.protocol==='https:'&&!url.username&&!url.password)return v}catch{}fail('Image must be an HTTPS URL or an uploaded image')}
export const problemTypes=['unusual_colour','odour','visible_particles','suspected_contamination'];
export function validate(kind,b){if(!b||typeof b!=='object'||Array.isArray(b))fail('Invalid request');
 if(kind==='problem_reports'){
  const r={
   reporter_name:str(b.reporter_name,'reporter name',100,true),
   reporter_id:str(b.reporter_id,'individual ID',80,true),
   location_or_source:str(b.location_or_source,'water source or location',200,true),
   problem_type:str(b.problem_type,'problem type',50,true),
   description:str(b.description??'','description',2000,false)
  };
  if(!problemTypes.includes(r.problem_type))fail('Invalid problem type');
  return r;
 }
 if(kind==='locations')return {id:str(b.id,'building ID',80,true),name:str(b.name,'building name',200,true),name_bn:str(b.name_bn??'','Bangla name',200),kind:str(b.kind??'','building type',80),sort_order:integer(b.sort_order??0,'sort order')};
 if(kind==='sources')return {code:str(b.code,'source code',120,true),location_id:str(b.location_id,'building',80,true),label:str(b.label??'','label',200),label_bn:str(b.label_bn??'','Bangla label',200),sort_order:integer(b.sort_order??0,'sort order')};
 if(kind==='reports'){
 const r={source_code:str(b.source_code,'source',120,true),screening_status:b.screening_status,sampled_at:date(b.sampled_at,'sample date'),tested_at:date(b.tested_at,'test date'),next_screening_at:date(b.next_screening_at,'next screening date'),photo_url:imageUrl(b.photo_url)||null,laboratory:str(b.laboratory??'','laboratory',200),laboratory_bn:str(b.laboratory_bn??'','Bangla laboratory',200),notes:str(b.notes??'','notes',5000),notes_bn:str(b.notes_bn??'','Bangla notes',5000),coliform_status:b.coliform_status??'not_tested',is_published:b.is_published};
 if(!screeningStatuses.includes(r.screening_status)||!['detected','not_detected','not_tested'].includes(r.coliform_status))fail('Invalid test status');
 if(typeof r.is_published!=='boolean')fail('Publication state required');
 if(r.tested_at&&r.next_screening_at&&r.next_screening_at<r.tested_at)fail('Next screening date cannot precede the test date');
 for(const [key,max]of [['ph',14],['tds',100000],['turbidity',100000]]){const value=b[key];if(value==null||value==='')r[key]=null;else{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max)fail(`Invalid ${key}`);r[key]=value}}return r;
 }
 if(kind==='settings'){
 const r={};for(const key of ['brand','tagline_en','tagline_bn','heading_en','heading_bn'])r[key]=str(b[key]??defaultSettings[key],key,200,true);
 for(const key of ['accent','background']){r[key]=b[key]??defaultSettings[key];if(!/^#[0-9a-fA-F]{6}$/.test(r[key]))fail('Use a six-digit hex color')}
 r.logo_url=imageUrl(b.logo_url);if(typeof b.intro_enabled!=='boolean')fail('Invalid intro setting');r.intro_enabled=b.intro_enabled;
 for(const key of ['translations_en','translations_bn']){r[key]={};const input=b[key]??{};if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).length>250)fail('Invalid translations');for(const [k,v]of Object.entries(input)){if(!/^[a-zA-Z][a-zA-Z_0-9]{0,60}$/.test(k)||['constructor','prototype','__proto__'].includes(k))fail('Invalid translation key');r[key][k]=str(v,'translation',3000)}}return r;
 }fail('Unknown resource',404);
}
export function identifyImage(buffer){if(!Buffer.isBuffer(buffer)||buffer.length<12||buffer.length>5242880)fail('Upload an image up to 5 MB');if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return'image/png';if(buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return'image/jpeg';if(buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP')return'image/webp';fail('Only PNG, JPEG and WebP images are supported')}
