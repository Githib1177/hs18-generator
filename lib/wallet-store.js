export async function redis(command){
 const env=process.env;
 const url=env.UPSTASH_REDIS_REST_URL||env.KV_REST_API_URL||env.UPSTASH_REDIS_REST_KV_REST_API_URL;
 const token=env.UPSTASH_REDIS_REST_TOKEN||env.KV_REST_API_TOKEN||env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
 if(!url||!token)throw new Error('Chybí úložiště karet.');
 const response=await fetch(url,{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(command)});
 const data=await response.json();if(!response.ok||data.error)throw new Error('Úložiště karet není dostupné.');return data.result;
}
export const stayKey=hash=>'hs18:wallet:stay:'+hash;
export const passKey=id=>'hs18:wallet:pass:'+id;
export const lockKey=hash=>'hs18:wallet:lock:'+hash;
