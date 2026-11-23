import {instagram} from '../server/instagram.js';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  const origin=req.headers.origin;
  if(origin){try{if(new URL(origin).host!==req.headers.host)return res.status(403).json({error:'허용되지 않은 요청입니다.'});}catch{return res.status(403).json({error:'허용되지 않은 요청입니다.'});}}
  const action=req.query.action;
  if(req.method!==(action==='status'?'GET':'POST'))return res.status(405).json({error:'Method not allowed'});
  try {return res.status(200).json(await instagram(action,req.body||{}));}
  catch(e) {return res.status(e.status||500).json({error:e.status?e.message:'인스타그램 처리 중 오류가 발생했습니다. 다시 시도하세요.'});}
}
export const config={api:{bodyParser:{sizeLimit:'4.5mb'}},maxDuration:120};
