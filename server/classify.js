// 사진 자동 분류 (Claude API, 비전): 여러 장을 한 번에 받아
// ① 같은 옷끼리 묶고 ② 컷 종류를 판별합니다. 확신이 낮으면 review=true.
import Anthropic from '@anthropic-ai/sdk';
import {z} from 'zod';
import {betaZodOutputFormat} from '@anthropic-ai/sdk/helpers/beta/zod';

export const SHOTS=['front','frontZoom','frontTop','frontBottom','side','back','fabric','fit','detail','unknown'];
export const MAX_PHOTOS=24;
const MODEL='claude-opus-5-5';

const Result=z.object({
  garments:z.array(z.object({id:z.string(),description:z.string()})),
  photos:z.array(z.object({
    index:z.number().int(),
    garment:z.string(),
    shot:z.enum(SHOTS),
    confidence:z.number(),
    review:z.boolean(),
    note:z.string(),
  })),
});

const INSTRUCTIONS=`You sort product photos for a women's clothing shop. Photos were taken in a store, usually on a mannequin in front of a wall. Each photo is labeled "Photo N" before it.

1. Group photos that show the same physical garment (same item, same color). Different colors of the same design are different garments. Give each garment an id like "g1" and a short Korean description (color + type, e.g. "카키 브이넥 긴팔티").
2. Label every photo with one shot type:
- front: the whole garment from the front
- frontZoom: front view zoomed in on the middle of the garment (most of the body, cropped at the edges, not only the top or bottom)
- frontTop: front close-up of the upper part (neckline, shoulders, chest)
- frontBottom: front close-up of the lower part (hem, waist, legs for pants)
- side: side view
- back: back view
- fabric: extreme close-up of fabric texture, weave or knit
- fit: worn by a real person (model shot)
- detail: other close-up (button, pocket, label, zipper, cuff)
- unknown: cannot tell
3. confidence is 0 to 1. Set review=true when you are not sure: similar-colored garments that could be the same or different, fabric close-ups that could belong to several garments, or an unclear shot type. note: one short Korean sentence explaining the doubt, or "" when sure.
Return every photo exactly once, using its number as index.`;

const fail=(message,status)=>Object.assign(new Error(message),{status});

export async function classifyPhotos(body,env=process.env,client) {
  if(!env.ANTHROPIC_API_KEY&&!client)throw fail('현재 실행 환경에 ANTHROPIC_API_KEY가 연결되지 않았습니다.',503);
  const photos=Array.isArray(body.photos)?body.photos:[];
  if(!photos.length||photos.length>MAX_PHOTOS)throw fail(`사진은 한 번에 1~${MAX_PHOTOS}장까지 분류할 수 있습니다.`,400);
  const content=[];
  photos.forEach((p,i)=>{
    const m=typeof p.image==='string'&&p.image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if(!m||p.image.length>400000)throw fail('분류용 사진 형식이 올바르지 않습니다.',400);
    content.push({type:'text',text:`Photo ${i+1}`},{type:'image',source:{type:'base64',media_type:`image/${m[1]}`,data:m[2]}});
  });
  content.push({type:'text',text:INSTRUCTIONS});
  const anthropic=client||new Anthropic({apiKey:env.ANTHROPIC_API_KEY,timeout:120000,maxRetries:1});
  let response;
  try {
    response=await anthropic.beta.messages.parse({
      model:MODEL,
      max_tokens:16000,
      output_config:{effort:'medium',format:betaZodOutputFormat(Result)},
      // 안전 분류기가 거절하면 서버가 다른 모델로 다시 시도합니다.
      betas:['server-side-fallback-2026-07-01'],
      fallbacks:'default',
      messages:[{role:'user',content}],
    });
  } catch(e) {
    if(e instanceof Anthropic.AuthenticationError)throw fail('Claude API 키 인증에 실패했습니다. Vercel의 ANTHROPIC_API_KEY를 확인하세요.',401);
    if(e instanceof Anthropic.PermissionDeniedError)throw fail('Claude API 사용 권한이 없습니다. 크레딧 충전 상태를 확인하세요.',403);
    if(e instanceof Anthropic.RateLimitError)throw fail('Claude API 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.',429);
    if(e instanceof Anthropic.BadRequestError)throw fail(`Claude API 요청 오류: ${String(e.message).slice(0,200)}`,400);
    if(e instanceof Anthropic.APIError)throw fail(`Claude API 오류 (${e.status??'연결'}). 잠시 후 다시 시도하세요.`,502);
    throw e;
  }
  if(response.stop_reason==='refusal')throw fail('Claude가 이 사진들의 분류를 거절했습니다. 사진을 확인하세요.',422);
  if(response.stop_reason==='max_tokens'||!response.parsed_output)throw fail('분류 결과를 읽지 못했습니다. 사진 수를 줄여 다시 시도하세요.',502);
  const out=response.parsed_output,seen=new Set();
  const list=out.photos.filter(p=>p.index>=1&&p.index<=photos.length&&!seen.has(p.index)&&seen.add(p.index)).map(p=>({
    id:photos[p.index-1].id,garment:p.garment,shot:p.shot,confidence:Math.max(0,Math.min(1,p.confidence)),
    review:p.review||p.confidence<.6||p.shot==='unknown',note:p.note,
  }));
  // 빠진 사진은 확인 필요로 돌려줍니다.
  photos.forEach((p,i)=>{if(!seen.has(i+1))list.push({id:p.id,garment:out.garments[0]?.id||'g1',shot:'unknown',confidence:0,review:true,note:'분류 결과에서 빠졌습니다.'});});
  return {garments:out.garments,photos:list,model:response.model,usage:{input:response.usage.input_tokens,output:response.usage.output_tokens}};
}

// ---- 수정할 곳 찾기 (Claude 비전) → IOPaint로 지울 영역 ----
export const DEFECTS=['stain','wrinkle','lint','thread','mannequin_mark','wall_mark','other'];
const Defects=z.object({regions:z.array(z.object({
  type:z.enum(DEFECTS),
  x0:z.number().int(),y0:z.number().int(),x1:z.number().int(),y1:z.number().int(),
  confidence:z.number(),
  note:z.string(),
}))});
const DEFECT_INSTRUCTIONS=`This is a clothing product photo (usually on a mannequin, background may already be removed to white). Find small, local flaws that should be erased with an inpainting tool so the product looks clean:
- stain: spots, smudges or discoloration on the garment or mannequin
- wrinkle: accidental creases, dents or crumpled spots in the fabric (NOT designed folds, pleats, gathers, ribbing, seams or the natural drape around the body)
- lint: dust, fluff or hair
- thread: loose threads
- mannequin_mark: marks, tape or damage on the mannequin
- wall_mark: leftover wall/background marks
Never mark prints, logos, buttons, labels the shop wants visible, stitching, pockets or texture of the fabric itself. Prefer missing a doubtful spot over marking a real design element.
Coordinates: the image is ${'{W}'}x${'{H}'} pixels; give each region as a tight box in a 0-1000 scale of width (x) and height (y), with x0<x1 and y0<y1. Keep boxes as small as possible while fully covering the flaw. At most 12 regions. note: one short Korean phrase describing the flaw. Return an empty list if the photo is clean.`;

export async function findDefects(body,env=process.env,client) {
  if(!env.ANTHROPIC_API_KEY&&!client)throw fail('현재 실행 환경에 ANTHROPIC_API_KEY가 연결되지 않았습니다.',503);
  const m=typeof body.image==='string'&&body.image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if(!m||body.image.length>2500000)throw fail('검사할 사진 형식이 올바르지 않습니다.',400);
  const W=Number(body.width)||0,H=Number(body.height)||0;
  const anthropic=client||new Anthropic({apiKey:env.ANTHROPIC_API_KEY,timeout:120000,maxRetries:1});
  let response;
  try {
    response=await anthropic.beta.messages.parse({
      model:MODEL,max_tokens:16000,
      output_config:{effort:'medium',format:betaZodOutputFormat(Defects)},
      betas:['server-side-fallback-2026-07-01'],fallbacks:'default',
      messages:[{role:'user',content:[
        {type:'image',source:{type:'base64',media_type:`image/${m[1]}`,data:m[2]}},
        {type:'text',text:DEFECT_INSTRUCTIONS.replace('{W}',W||'?').replace('{H}',H||'?')},
      ]}],
    });
  } catch(e) {
    if(e instanceof Anthropic.AuthenticationError)throw fail('Claude API 키 인증에 실패했습니다.',401);
    if(e instanceof Anthropic.RateLimitError)throw fail('Claude API 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.',429);
    if(e instanceof Anthropic.BadRequestError)throw fail(`Claude API 요청 오류: ${String(e.message).slice(0,200)}`,400);
    if(e instanceof Anthropic.APIError)throw fail(`Claude API 오류 (${e.status??'연결'}). 잠시 후 다시 시도하세요.`,502);
    throw e;
  }
  if(response.stop_reason==='refusal')throw fail('Claude가 이 사진 검사를 거절했습니다.',422);
  if(!response.parsed_output)throw fail('검사 결과를 읽지 못했습니다. 다시 시도하세요.',502);
  const clamp=v=>Math.max(0,Math.min(1000,v));
  const regions=response.parsed_output.regions.map(r=>({...r,x0:clamp(Math.min(r.x0,r.x1)),x1:clamp(Math.max(r.x0,r.x1)),y0:clamp(Math.min(r.y0,r.y1)),y1:clamp(Math.max(r.y0,r.y1)),confidence:Math.max(0,Math.min(1,r.confidence))}))
    .filter(r=>r.x1-r.x0>=2&&r.y1-r.y0>=2).slice(0,12);
  return {regions,model:response.model};
}
