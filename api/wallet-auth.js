import { clearSessionCookie, createSessionCookie, isAuthorized } from './_wallet-auth.js';

export function createAuthHandler({fetcher=fetch}={}){return async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ ok: isAuthorized(req) });
  if (req.method === 'POST') {
    if(!process.env.HILLSIDE_WALLET_SESSION_SECRET)return res.status(503).json({ok:false,error:'Správa karet zatím není připravená.'});
    if(typeof req.body?.password!=='string'||!req.body.password||req.body.password.length>256)return res.status(401).json({ok:false,error:'Nesprávné heslo'});
    // Validate against the existing Falconi login; no second copy of its password is stored.
    try{
      const upstream=await fetcher('https://falconi-messenger.vercel.app/api/auth',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({password:req.body.password})});
      const result=await upstream.json();
      if(!upstream.ok||result.ok!==true)return res.status(401).json({ok:false,error:'Nesprávné heslo'});
    }catch{return res.status(503).json({ok:false,error:'Přihlášení nyní není dostupné. Zkuste to znovu.'});}
    res.setHeader('Set-Cookie', createSessionCookie());
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ ok: false });
};}
export default createAuthHandler();
