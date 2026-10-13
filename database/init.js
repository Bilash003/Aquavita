import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {locations} from '../dist/data.js';
import {banglaNames} from '../dist/i18n.js';
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL to your Neon connection string');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
try{await client.connect();await client.query('BEGIN');await client.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
await client.query("CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
const seeded=await client.query("SELECT 1 FROM app_migrations WHERE name='initial-directory'");
if(!seeded.rowCount){for(const l of locations){await client.query('INSERT INTO locations(id,name,kind,name_bn,sort_order) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[l.id,l.name,l.kind,banglaNames[l.id]||'',locations.indexOf(l)]);for(const code of l.sources)await client.query('INSERT INTO sources(code,location_id) VALUES($1,$2) ON CONFLICT(code) DO NOTHING',[code,l.id])}await client.query("INSERT INTO app_migrations(name) VALUES('initial-directory') ON CONFLICT DO NOTHING");}
await client.query('COMMIT');console.log('Database migrations complete; initial directory seeded only once.');}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{await client.end()}
