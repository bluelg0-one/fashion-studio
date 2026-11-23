// 인스타그램 게시 (Instagram API with Instagram Login · graph.instagram.com).
// 흐름: 사진을 공개 주소에 잠깐 올림 → 인스타그램이 그 주소에서 사진을 가져감(컨테이너) → 게시 → 올려 둔 사진 삭제.
// 문서: developers.facebook.com/docs/instagram-platform/content-publishing
import {createHash, timingSafeEqual} from 'node:crypto';

const GRAPH='https://graph.instagram.com/v25.0';
// Vercel 요청 한도(4.5MB) 안쪽. 사진은 한 요청에 1장씩 받습니다.
const MAX_IMAGE_CHARS=4_200_000, MAX_BODY=MAX_IMAGE_CHARS+20_000;
export const IG_LIMITS={maxImages:10,captionMax:2200,hashtagMax:30,minRatio:.8,maxRatio:1.91};
const BLOB_HOST='.public.blob.vercel-storage.com', BLOB_PREFIX='instagram/', DAY=24*60*60*1000;
const fail=(message,status)=>Object.assign(new Error(message),{status});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// 인스타그램이 사진을 가져갈 수 있는 공개 저장소(Vercel Blob). 게시가 끝나면 지웁니다.
export function blobStore(env) {
  const token=env.BLOB_READ_WRITE_TOKEN;
  if(!token)return null;
  const sdk=()=>import('@vercel/blob');
  return {
    async put(name,buffer) {return (await (await sdk()).put(BLOB_PREFIX+name,buffer,{access:'public',contentType:'image/jpeg',addRandomSuffix:true,token})).url;},
    async del(urls) {if(urls.length)await (await sdk()).del(urls,{token});},
    // 게시하지 않고 남은 사진(하루 이상 지난 것)을 정리합니다.
    async sweep(olderThan=DAY) {
      const {list,del}=await sdk(),{blobs}=await list({prefix:BLOB_PREFIX,limit:100,token});
      const old=blobs.filter(b=>Date.now()-new Date(b.uploadedAt).getTime()>olderThan).map(b=>b.url);
      if(old.length)await del(old,{token});
      return old.length;
    },
    owns(url) {try{const u=new URL(url);return u.protocol==='https:'&&u.hostname.endsWith(BLOB_HOST)&&u.pathname.startsWith('/'+BLOB_PREFIX);}catch{return false;}},
  };
}

// 게시는 비밀번호가 맞을 때만 합니다. 비밀번호가 서버에 없으면 아예 게시하지 않습니다.
async function authorize(body,env,delay) {
  if(!env.INSTAGRAM_POST_PASSWORD)throw fail('서버에 게시 비밀번호(INSTAGRAM_POST_PASSWORD)가 설정되지 않아 게시할 수 없습니다.',503);
  const digest=value=>createHash('sha256').update(String(value??'')).digest();
  if(timingSafeEqual(digest(body.password),digest(env.INSTAGRAM_POST_PASSWORD)))return;
  await delay(800);
  throw fail('게시 비밀번호가 맞지 않습니다.',401);
}

function graphError(httpStatus,error,token) {
  const code=error?.code,sub=error?.error_subcode;
  let detail=String(error?.error_user_msg||error?.message||'').slice(0,300);
  if(token)detail=detail.split(token).join('***');
  const tail=detail?` · 인스타그램 응답: ${detail}`:'';
  if(code===190)return fail('인스타그램 액세스 토큰이 만료됐거나 올바르지 않습니다. 토큰을 새로 발급해 INSTAGRAM_ACCESS_TOKEN 값을 바꿔 주세요.'+tail,502);
  if([4,17,32,613].includes(code)||sub===2207042)return fail('인스타그램 게시·요청 한도에 도달했습니다. 시간을 두고 다시 시도하세요.'+tail,429);
  if([10,200].includes(code)||(code>=200&&code<300))return fail('인스타그램 게시 권한이 없습니다. 토큰을 만들 때 게시 권한(instagram_business_content_publish)을 포함했는지 확인하세요.'+tail,502);
  return fail(`인스타그램 요청 실패 (${httpStatus}${code?` · 코드 ${code}`:''})`+tail,502);
}

async function graph(env,request,path,{method='GET',body,query,unreachable='인스타그램 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.'}={}) {
  const url=new URL(GRAPH+path);
  for(const [key,value] of Object.entries(query||{}))url.searchParams.set(key,value);
  let response;
  try {
    response=await request(url.toString(),{method,headers:{Authorization:`Bearer ${env.INSTAGRAM_ACCESS_TOKEN}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
  } catch {throw fail(unreachable,502);}
  let data={};
  try {data=await response.json();} catch {}
  if(!response.ok||data?.error)throw graphError(response.status,data?.error,env.INSTAGRAM_ACCESS_TOKEN);
  return data;
}

async function account(env,request) {
  const data=await graph(env,request,'/me',{query:{fields:'user_id,username'}});
  const me=Array.isArray(data.data)?data.data[0]||{}:data;
  const id=String(env.INSTAGRAM_USER_ID||me.user_id||me.id||'');
  if(!/^\d+$/.test(id))throw fail('인스타그램 계정 정보를 읽지 못했습니다. 토큰을 확인하세요.',502);
  return {id,username:String(me.username||'')};
}

function jpegSize(buffer) {
  if(buffer.length<4||buffer[0]!==0xff||buffer[1]!==0xd8)return null;
  for(let i=2;i+9<buffer.length;){
    if(buffer[i]!==0xff)return null;
    const marker=buffer[i+1];
    if(marker===0xff){i++;continue;}
    if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker))return {height:buffer.readUInt16BE(i+5),width:buffer.readUInt16BE(i+7)};
    i+=2+buffer.readUInt16BE(i+2);
  }
  return null;
}

export function countHashtags(caption) {return (String(caption).match(/#[^\s#]+/g)||[]).length;}

async function upload(body,env,store) {
  if(!store)throw fail('사진을 잠깐 올려 둘 공개 저장소(BLOB_READ_WRITE_TOKEN)가 서버에 연결되지 않았습니다.',503);
  const match=typeof body.image==='string'&&body.image.length<=MAX_IMAGE_CHARS&&body.image.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if(!match)throw fail('인스타그램에는 3MB 이하 JPG 사진만 올릴 수 있습니다.',400);
  const buffer=Buffer.from(match[1],'base64'),size=jpegSize(buffer);
  if(!size||!size.width||!size.height)throw fail('JPG 사진을 읽을 수 없습니다.',400);
  const ratio=size.width/size.height;
  if(ratio<IG_LIMITS.minRatio-.01||ratio>IG_LIMITS.maxRatio+.01)throw fail('사진 비율은 4:5(세로)에서 1.91:1(가로) 사이여야 합니다.',400);
  // 지난 게시에서 남은 사진 정리는 실패해도 이번 업로드를 막지 않습니다.
  try {await store.sweep?.();} catch {}
  return {url:await store.put(`${Date.now()}.jpg`,buffer),width:size.width,height:size.height};
}

async function waitUntilReady(env,request,id,delay) {
  for(let attempt=0;attempt<30;attempt++){
    const data=await graph(env,request,`/${id}`,{query:{fields:'status_code,status'}});
    if(data.status_code==='FINISHED')return;
    if(['ERROR','EXPIRED'].includes(data.status_code))throw fail(`인스타그램이 사진을 처리하지 못했습니다${data.status?` (${String(data.status).slice(0,200)})`:''}. 사진을 확인하고 다시 시도하세요.`,502);
    await delay(2000);
  }
  throw fail('인스타그램 사진 처리가 1분 안에 끝나지 않았습니다. 게시되지 않았으니 잠시 후 다시 시도하세요.',504);
}

async function publish(body,env,request,store,delay) {
  if(!store)throw fail('사진을 잠깐 올려 둘 공개 저장소(BLOB_READ_WRITE_TOKEN)가 서버에 연결되지 않았습니다.',503);
  const urls=Array.isArray(body.urls)?body.urls:[],caption=typeof body.caption==='string'?body.caption.trim():'';
  if(!urls.length||urls.length>IG_LIMITS.maxImages)throw fail(`사진은 1~${IG_LIMITS.maxImages}장이어야 합니다.`,400);
  if(!urls.every(url=>typeof url==='string'&&store.owns(url))||new Set(urls).size!==urls.length)throw fail('이 앱에서 올린 사진만 게시할 수 있습니다.',400);
  if(caption.length>IG_LIMITS.captionMax)throw fail(`캡션은 ${IG_LIMITS.captionMax}자 이하여야 합니다.`,400);
  if(countHashtags(caption)>IG_LIMITS.hashtagMax)throw fail(`해시태그는 ${IG_LIMITS.hashtagMax}개 이하여야 합니다.`,400);
  try {
    const {id:user,username}=await account(env,request);
    let creation;
    if(urls.length===1){
      creation=(await graph(env,request,`/${user}/media`,{method:'POST',body:{image_url:urls[0],caption}})).id;
    } else {
      const children=[];
      for(const url of urls)children.push((await graph(env,request,`/${user}/media`,{method:'POST',body:{image_url:url,is_carousel_item:true}})).id);
      creation=(await graph(env,request,`/${user}/media`,{method:'POST',body:{media_type:'CAROUSEL',children:children.join(','),caption}})).id;
    }
    if(!creation)throw fail('인스타그램이 게시 준비 번호를 돌려주지 않았습니다. 다시 시도하세요.',502);
    await waitUntilReady(env,request,creation,delay);
    // 이 요청만은 응답을 못 받아도 실제로는 게시됐을 수 있어, 중복 게시를 막도록 따로 안내합니다.
    const published=await graph(env,request,`/${user}/media_publish`,{method:'POST',body:{creation_id:creation},unreachable:'게시 요청의 결과를 받지 못했습니다. 인스타그램 앱에서 게시됐는지 먼저 확인한 뒤, 올라가지 않았을 때만 다시 시도하세요.'});
    let permalink='';
    try {permalink=(await graph(env,request,`/${published.id}`,{query:{fields:'permalink'}})).permalink||'';} catch {}
    return {id:String(published.id||''),permalink,username,count:urls.length};
  } finally {
    // 성공·실패와 관계없이 공개 저장소의 사진은 지웁니다.
    try {await store.del(urls);} catch {}
  }
}

export async function instagram(action,body={},env=process.env,request=fetch,store=blobStore(env),delay=sleep) {
  const missing=[!env.INSTAGRAM_ACCESS_TOKEN&&'token',!store&&'storage',!env.INSTAGRAM_POST_PASSWORD&&'password'].filter(Boolean);
  if(action==='status')return {ready:!missing.length,token:Boolean(env.INSTAGRAM_ACCESS_TOKEN),storage:Boolean(store),password:Boolean(env.INSTAGRAM_POST_PASSWORD)};
  if(!['check','upload','publish'].includes(action))throw fail('지원하지 않는 작업입니다.',400);
  await authorize(body,env,delay);
  if(!env.INSTAGRAM_ACCESS_TOKEN)throw fail('서버에 인스타그램 액세스 토큰(INSTAGRAM_ACCESS_TOKEN)이 연결되지 않았습니다.',503);
  if(action==='upload')return upload(body,env,store);
  if(action==='publish')return publish(body,env,request,store,delay);
  // check: 토큰이 살아 있는지와 어느 계정에 올라가는지, 24시간 게시 횟수를 확인합니다.
  const me=await account(env,request);
  let used=null,limit=null;
  try {
    const quota=(await graph(env,request,`/${me.id}/content_publishing_limit`,{query:{fields:'quota_usage,config'}})).data?.[0];
    if(quota){used=Number(quota.quota_usage??NaN);limit=Number(quota.config?.quota_total??NaN);}
  } catch {}
  return {username:me.username,used:Number.isFinite(used)?used:null,limit:Number.isFinite(limit)?limit:null};
}

// 로컬 실행(vite dev, npm start)용. Vercel에서는 api/instagram.js가 같은 일을 합니다.
export async function instagramMiddleware(req,res,next) {
  const url=new URL(req.url,'http://localhost');
  if(url.pathname!=='/api/instagram')return next();
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  try {
    const action=url.searchParams.get('action');
    if(req.method!==(action==='status'?'GET':'POST')){res.statusCode=405;return res.end(JSON.stringify({error:'Method not allowed'}));}
    if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){res.statusCode=403;return res.end(JSON.stringify({error:'허용되지 않은 요청입니다.'}));}
    let text='';
    for await (const chunk of req){text+=chunk;if(text.length>MAX_BODY)throw fail('사진이 너무 큽니다.',413);}
    res.end(JSON.stringify(await instagram(action,text?JSON.parse(text):{})));
  } catch(e) {res.statusCode=e.status||500;res.end(JSON.stringify({error:e.status?e.message:'인스타그램 처리 중 오류가 발생했습니다. 다시 시도하세요.'}));}
}
