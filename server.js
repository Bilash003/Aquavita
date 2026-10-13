import pg from 'pg';
import {createApp} from './backend/app.js';
import {firebaseAuth} from './backend/auth.js';
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:10000}):null;
const auth=firebaseAuth();
const app=createApp({pool,auth});
const server=app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('AquaVita server ready'));
function shutdown(){server.close(async()=>{if(pool)await pool.end();process.exit(0)})}process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
