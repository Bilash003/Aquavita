import {initializeApp,cert,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
export function firebaseAuth(env=process.env){
 if(!env.FIREBASE_SERVICE_ACCOUNT_JSON&&!env.GOOGLE_APPLICATION_CREDENTIALS)return null;
 const credential=env.FIREBASE_SERVICE_ACCOUNT_JSON?cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON)):applicationDefault();
 return getAuth(initializeApp({credential,projectId:env.FIREBASE_PROJECT_ID}));
}
export function createAuthMiddleware({auth,pool,ownerUid}){
 return async(req,res,next)=>{try{
 if(!auth)return res.status(503).json({error:'Firebase authentication has not been configured on this server.'});
 const token=req.get('authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token)return res.status(401).json({error:'Sign in to continue.'});
 let user;try{user=await auth.verifyIdToken(token,true)}catch{return res.status(401).json({error:'Your session expired or is invalid. Please sign in again.'})}
 req.user=user;if(!user.email_verified)return res.status(403).json({error:'Verify your email address before opening the dashboard.'});
 if(!pool)return res.status(503).json({error:'Database has not been configured.'});
 req.role=user.uid===ownerUid?'owner':(await pool.query('SELECT uid FROM admins WHERE uid=$1',[user.uid])).rowCount?'admin':'viewer';next();
 }catch(e){next(e)}};
}
export const requireAdmin=(req,res,next)=>['owner','admin'].includes(req.role)?next():res.status(403).json({error:'This account has not been granted administrator access.'});
export const requireOwner=(req,res,next)=>req.role==='owner'?next():res.status(403).json({error:'Only the owner can manage administrator access.'});
