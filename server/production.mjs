import {resolve} from 'node:path';
import {createSecurityServer} from './security.mjs';
import {createSupabaseDatabase} from './supabase-database.mjs';
import {createZipDataAPI} from './zip-data-api.mjs';
const db=createSupabaseDatabase();
let api;
const app=createSecurityServer({configPath:resolve(process.env.SECURITY_DATA_DIR||'private','security.json'),apiHandler:(req,res)=>api?.(req,res)});
api=createZipDataAPI(db,{verifyCaptcha:app.verifyCaptcha});
app.server.listen(Number(process.env.PORT)||3000,process.env.HOST||'127.0.0.1',()=>console.log('Portal TVS V60 conectado a Supabase.'));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;app.server.close(async()=>{await db.close();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
