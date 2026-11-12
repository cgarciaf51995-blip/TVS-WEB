import pg from 'pg';
export function createSupabaseDatabase(env=process.env){
 if(!env.DATABASE_URL)throw new Error('Configura DATABASE_URL solo en el servidor.');
 const max=Number(env.DB_POOL_MAX||3);if(!Number.isInteger(max)||max<1||max>8)throw new Error('DB_POOL_MAX debe estar entre 1 y 8.');
 const pool=new pg.Pool({connectionString:env.DATABASE_URL,max,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,statement_timeout:30000,application_name:'tvs-v60-supabase'});
 pool.on('error',()=>console.error('No se pudo mantener la conexión a Supabase.'));
 return {pool,query:(text,values)=>pool.query(text,values),close:()=>pool.end()};
}
