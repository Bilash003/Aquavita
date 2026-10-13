import {initializeApp} from 'firebase/app';
import {getAuth,setPersistence,browserSessionPersistence,browserLocalPersistence,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,signOut,updateProfile,reload} from 'firebase/auth';
let authPromise;
async function readJson(response){
  let raw;
  try{raw=await response.text()}catch{throw Error('Cannot reach AquaVita API. Check your internet connection and Cloudflare deployment.')}
  if(!raw.trim())throw Error(`AquaVita API returned an empty response (HTTP ${response.status}). Check Cloudflare Pages Functions deployment.`);
  let data;
  try{data=JSON.parse(raw)}catch{throw Error(`AquaVita API returned invalid JSON (HTTP ${response.status}). Check Cloudflare Pages Functions deployment.`)}
  if(!response.ok)throw Error(data.error||`API request failed (HTTP ${response.status})`);
  return data;
}
export function initAuth(){
  return authPromise??=(async()=>{
    let response;
    try{response=await fetch('/api/auth/config',{cache:'no-store'})}catch{throw Error('Cannot contact AquaVita Firebase API. Check Cloudflare Pages deployment.')}
    const config=await readJson(response);
    if(!config.configured||!config.firebase?.apiKey||!config.firebase?.projectId)
      throw Error('Firebase is not configured on Cloudflare Pages. Add the four FIREBASE_* web variables and redeploy.');
    const auth=getAuth(initializeApp(config.firebase));
    await auth.authStateReady();
    if(!auth.currentUser)await setPersistence(auth,browserSessionPersistence);
    return auth;
  })().catch(e=>{authPromise=undefined;throw e});
}
export async function request(url,options={}){
  const auth=await initAuth();
  if(!auth.currentUser)throw Error('Please sign in again.');
  const token=await auth.currentUser.getIdToken();
  const headers=new Headers(options.headers||{});
  headers.set('Authorization',`Bearer ${token}`);
  if(options.body&&typeof options.body==='string')headers.set('Content-Type','application/json');
  let response;
  try{response=await fetch(url,{...options,headers})}catch{throw Error('Cannot connect to AquaVita API. Verify your Cloudflare Pages backend.')}
  return readJson(response);
}
export {onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,signOut,updateProfile,reload,setPersistence,browserLocalPersistence,browserSessionPersistence};
