import { studio } from '../server/studio.js';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  const origin=req.headers.origin;
  if(origin){try{if(new URL(origin).host !== req.headers.host)return res.status(403).json({error:'허용되지 않은 요청입니다.'});}catch{return res.status(403).json({error:'허용되지 않은 요청입니다.'});}}
  const action=req.query.action;
  if(req.method !== (action==='status'?'GET':'POST')) return res.status(405).json({error:'Method not allowed'});
  try { return res.status(200).json(await studio(action,req.body||{})); }
  catch(e) {return res.status(e.status||500).json({error:e.status?e.message:'AI 처리에 실패했습니다. 다시 시도하세요.'});}
}
export const config={api:{bodyParser:{sizeLimit:'9mb'}},maxDuration:300};
