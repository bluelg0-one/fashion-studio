// 상세페이지 디자인 테마. 미리보기·PNG(캔버스)와 HTML이 같은 테마 값(색·글꼴·여백)으로 그려집니다.
// '기본'(basic)은 기존 렌더러(studioImages.renderDocument, studioDocument.documentHtml)를 그대로 씁니다.
//
// 글꼴은 모두 Google Fonts에서 받는 SIL Open Font License 1.1 글꼴입니다(무료 상업 이용·이미지 삽입 가능).
//   Noto Serif KR, Noto Sans KR, Cormorant Garamond, Gowun Batang, Gowun Dodum, Playfair Display
// 글꼴을 받지 못하면(인터넷 끊김 등) 시스템 기본 글꼴로 그리고, 화면에 그 사실을 알립니다.
import {loadImage} from './studioImages.js';
import {guideUrl} from './studioDocument.js';
import {HANGER_V2} from './appMode.js';

const SERIF_KR='"Noto Serif KR", "Nanum Myeongjo", serif', SANS_KR='"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

export const THEMES={
  // 두손 베이직(015): 흰 바탕·넓은 여백·얇은 산세리프·영문 대문자 소제목, 사진은 가로를 꽉 채워 한 줄에 한 장, 둥근 카드 없음.
  // layout:'dooson' → studioDocument.documentBlocks가 DOOSON·소개·COLOR CHOICE·INFO가 있는 순서로 블록을 만듭니다(옷걸이 v2에서만).
  dooson:{
    id:'dooson',label:'두손 베이직',desc:'흰 바탕, 넓은 여백, 얇은 산세리프, 영문 대문자 소제목. 사진은 가로를 꽉 채워 한 장씩.',
    layout:'dooson',brand:true,
    google:'family=Noto+Sans+KR:wght@300;400;500',
    fonts:{title:{family:SANS_KR,weight:300},body:{family:SANS_KR,weight:400},en:{family:SANS_KR,weight:500},head:{family:SANS_KR,weight:500},brand:{family:SANS_KR,weight:500}},
    bg:'#ffffff',text:'#1f1f1f',soft:'#3d3d3d',muted:'#666666',line:'#e3e3e3',accent:'#1f1f1f',
    pad:80,gap:48,align:'center',radius:0,
    hero:{bleed:true,maxH:1300,top:28},photo:{maxH:1300,card:null,bleed:true},
    brand:{size:30,ls:10},headline:{font:'title',size:44,lh:1.45,ls:0},intro:{size:32,lh:1.7},tagline:{size:28,lh:1.6,ls:2},
    body:{size:32,lh:1.75},product:{size:28,lh:1.7},caption:{size:28,lh:1.7},note:{size:27,lh:1.7},
    tag:{size:28,ls:2,upper:false},section:{style:'caps',size:30,ls:8},table:{style:'lines',size:28},info:{size:30},
    colors:{cols:3,gap:20,name:28},bigGuide:true,pairs:false,
  },
  basic:{id:'basic',label:'기본',desc:'지금까지 쓰던 모양 그대로입니다.'},
  minimal:{
    id:'minimal',label:'미니멀 화이트',desc:'넓은 여백, 얇은 세리프 제목, 무채색. 차분하고 고급스럽게.',
    google:'family=Noto+Serif+KR:wght@300;500&family=Noto+Sans+KR:wght@300;400&family=Cormorant+Garamond:ital,wght@1,400',
    fonts:{title:{family:SERIF_KR,weight:300},body:{family:SANS_KR,weight:400},en:{family:`"Cormorant Garamond", ${SERIF_KR}`,weight:400,style:'italic'},head:{family:SANS_KR,weight:400}},
    bg:'#ffffff',text:'#2b2b2b',soft:'#444444',muted:'#6b6b6b',line:'#e6e6e6',accent:'#2b2b2b',
    pad:72,gap:44,align:'center',radius:0,
    hero:{bleed:false,maxH:1100,top:56},photo:{maxH:1000,card:null},
    headline:{font:'title',size:46,lh:1.45,ls:2},body:{size:32,lh:1.75},product:{size:28,lh:1.7},caption:{size:28,lh:1.7},note:{size:27,lh:1.7},
    tag:{size:26,ls:3,upper:true},section:{style:'rule',size:56},table:{style:'lines',size:28},bigGuide:true,pairs:false,
  },
  soft:{
    id:'soft',label:'소프트 무드',desc:'따뜻한 베이지 바탕, 둥근 카드, 부드러운 포인트 색.',
    google:'family=Gowun+Batang:wght@400;700&family=Gowun+Dodum',
    fonts:{title:{family:`"Gowun Batang", ${SERIF_KR}`,weight:700},body:{family:`"Gowun Dodum", ${SANS_KR}`,weight:400},en:{family:`"Gowun Batang", ${SERIF_KR}`,weight:700},head:{family:`"Gowun Batang", ${SERIF_KR}`,weight:700}},
    bg:'#f6efe7',text:'#4a3f38',soft:'#5c4d43',muted:'#765f50',line:'#eadccf',accent:'#a45f66',accentSoft:'#f4e4d8',card:'#ffffff',
    pad:44,gap:30,align:'center',radius:28,
    hero:{bleed:false,maxH:1100,top:8},photo:{maxH:1000,card:{pad:20}},
    headline:{font:'title',size:44,lh:1.45,ls:0},body:{size:32,lh:1.75},product:{size:28,lh:1.7},caption:{size:28,lh:1.7},note:{size:27,lh:1.7},
    tag:{size:28,ls:1,upper:false},section:{style:'pill',size:32},table:{style:'card',size:28},bigGuide:true,pairs:false,
  },
  magazine:{
    id:'magazine',label:'매거진',desc:'꽉 찬 대표 사진, 굵은 영문 제목, 디테일은 두 장씩 편집 배치.',
    google:'family=Playfair+Display:ital,wght@0,900;1,400&family=Noto+Serif+KR:wght@700&family=Noto+Sans+KR:wght@400;700',
    fonts:{title:{family:SERIF_KR,weight:700},body:{family:SANS_KR,weight:400},en:{family:`"Playfair Display", ${SERIF_KR}`,weight:900},num:{family:`"Playfair Display", ${SERIF_KR}`,weight:400,style:'italic'},head:{family:SANS_KR,weight:700}},
    bg:'#ffffff',text:'#111111',soft:'#333333',muted:'#707070',line:'#111111',accent:'#111111',
    pad:56,gap:36,align:'left',radius:0,
    hero:{bleed:true,maxH:1250,top:0},photo:{maxH:1000,card:null},
    headline:{font:'title',size:52,lh:1.35,ls:-1},body:{size:32,lh:1.75},product:{size:28,lh:1.7},caption:{size:28,lh:1.7},note:{size:27,lh:1.7},
    tag:{size:26,ls:2,upper:true},section:{style:'big',size:76,num:30},table:{style:'bold',size:28},pairs:true,bigGuide:true,
  },
};
// 목록 순서: 사장님이 고른 소프트 무드를 맨 앞에. 새로 만드는 상품은 소프트 무드로 시작합니다.
// (테마 정보가 없는 예전 상품은 themeOf()가 '기본'으로 열어 이미 만든 상세페이지가 바뀌지 않습니다.)
// 옷걸이 v2(015): 두손 베이직을 맨 앞에 두고 새 상품의 기본값으로 씁니다. ?v1(마네킹)에서는 예전 목록·기본값(소프트) 그대로입니다.
export const themeList=(v2=HANGER_V2)=>(v2?['dooson','soft','minimal','magazine','basic']:['soft','minimal','magazine','basic']).map(id=>THEMES[id]);
export const newProductTheme=(v2=HANGER_V2)=>v2?'dooson':'soft';
export const THEME_LIST=themeList();
export const NEW_PRODUCT_THEME=newProductTheme();
// documentBlocks에 넘길 구성(layout): 두손 베이직만 'dooson', 나머지는 null(예전 순서)
export const layoutOf=id=>themeOf(id).layout||null;
export const themeOf=id=>THEMES[id]||THEMES.basic;

// ── 글꼴 받기 ───────────────────────────────────────────────
const fontSpecs=t=>Object.values(t.fonts||{});
const fontString=(f,size)=>`${f.style||'normal'} ${f.weight} ${size}px ${f.family}`;
export const googleFontsUrl=t=>t.google?`https://fonts.googleapis.com/css2?${t.google}&display=swap`:'';
// 한국어 글꼴은 글자 범위별로 나뉘어 있어서, 실제로 쓸 글자(text)를 넘겨야 그 범위를 모두 받습니다.
// (예시 글자만 받으면 나머지 글자가 시스템 글꼴로 섞여 그려집니다.)
export async function ensureThemeFonts(theme,text='',timeout=15000) {
  if(!theme.google)return true;
  const href=googleFontsUrl(theme);
  if(!document.querySelector(`link[data-theme-font="${theme.id}"]`)){
    const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset.themeFont=theme.id;
    const loaded=new Promise(r=>{link.onload=()=>r(true);link.onerror=()=>r(false);});
    document.head.append(link);
    if(!await Promise.race([loaded,new Promise(r=>setTimeout(()=>r(false),timeout))]))return false;
  }
  const sample=[...new Set('가나다 Aa 0123456789'+text)].join('');
  try {
    await Promise.race([Promise.all(fontSpecs(theme).map(f=>document.fonts.load(fontString(f,32),sample))),new Promise((_,j)=>setTimeout(()=>j(new Error('timeout')),timeout))]);
  } catch {return false;}
  return fontSpecs(theme).every(f=>document.fonts.check(fontString(f,32),sample));
}

// ── 블록 → 화면 단위 ────────────────────────────────────────
// 매거진은 디테일 컷을 (이름+사진) 두 개씩 묶어 나란히 놓습니다. 순서는 그대로입니다.
export function themeUnits(blocks,theme) {
  const units=[];let section=0,inDetail=false;
  for(let i=0;i<blocks.length;i++){
    const b=blocks[i],role=b.role||(b.kind==='table'?'table':b.kind==='image'?(b.guide?'guide':'photo'):'body');
    if(role==='section'){section++;inDetail=b.section==='detail';units.push({type:'section',value:b.value,index:section,key:b.section});continue;}
    if(theme.pairs&&inDetail&&(role==='label'||role==='detail')){
      const items=[];
      while(i<blocks.length&&(blocks[i].role==='label'||blocks[i].role==='detail')){
        if(blocks[i].role==='label'&&blocks[i+1]?.role==='detail'){items.push({label:blocks[i].value,src:blocks[i+1].src,alt:blocks[i+1].label});i+=2;}
        else if(blocks[i].role==='detail'){items.push({label:'',src:blocks[i].src,alt:blocks[i].label});i++;}
        else {items.push({label:blocks[i].value,src:null});i++;}
      }
      i--;
      const photos=items.filter(x=>x.src);
      for(let k=0;k<photos.length;k+=2)units.push(photos.length-k===1?{type:'photo',src:photos[k].src,alt:photos[k].alt,label:photos[k].label}:{type:'pair',items:photos.slice(k,k+2)});
      continue;
    }
    if(role==='brand'){if(theme.brand)units.push({type:'brand',value:b.value});continue;}
    if(role==='colors'){units.push({type:'colors',items:b.items});continue;}
    if(role==='info'){units.push({type:'info',rows:b.rows});continue;}
    if(role==='hero')units.push({type:'hero',src:b.src,alt:b.label});
    else if(role==='photo'||role==='detail')units.push({type:'photo',src:b.src,alt:b.label});
    // 소프트·미니멀은 그림 안 글자를 키운 치수 그림을 씁니다(폰에서 약 12px).
    else if(role==='guide')units.push({type:'guide',src:theme.bigGuide&&b.garment?guideUrl(b.garment,'ko',{big:true}):b.src,alt:b.label});
    else if(role==='table')units.push({type:'table',headers:b.headers,rows:b.rows});
    else units.push({type:role,value:b.value});
  }
  return units;
}

// ── 캔버스(미리보기·PNG) ────────────────────────────────────
const WIDTH=860;
// 줄바꿈: 띄어쓰기 단위로 넘기고(낱말 중간에서 끊지 않음), 한 줄보다 긴 낱말만 글자 단위로 끊습니다.
export function wrap(ctx,value,width) {
  const lines=[],fits=t=>ctx.measureText(t).width<=width;
  for(const part of String(value).split('\n')){
    let line='';
    for(const word of part.split(/(?<= )/)){
      if(fits(line+word.trimEnd())){line+=word;continue;}
      if(line){lines.push(line.trimEnd());line='';}
      if(fits(word.trimEnd())){line=word;continue;}
      for(const ch of word){if(line&&!fits(line+ch)){lines.push(line);line='';}line+=ch;}
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
const setFont=(ctx,f,size,ls=0)=>{ctx.font=fontString(f,size);if('letterSpacing' in ctx)ctx.letterSpacing=`${ls}px`;};
function roundRect(ctx,x,y,w,h,r) {r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function textX(ctx,line,align,x,w) {const m=ctx.measureText(line).width;return align==='center'?x+(w-m)/2:align==='right'?x+w-m:x;}

function textUnit(ctx,t,{value,font,size,lh,ls=0,color,align=t.align,upper=false,width}) {
  const f=t.fonts[font]||t.fonts.body,inner=width??WIDTH-t.pad*2,v=upper?String(value).toUpperCase():value;
  setFont(ctx,f,size,ls);const lines=wrap(ctx,v,inner);
  return {height:lines.length*size*lh,draw:(c,y,x=t.pad)=>{setFont(c,f,size,ls);c.fillStyle=color;lines.forEach((line,i)=>c.fillText(line,textX(c,line,align,x,inner),y+i*size*lh+(lh-1)*size/2));}};
}

async function photoUnit(t,src,{bleed=false,maxH,card}) {
  const im=await loadImage(src);
  const avail=bleed?WIDTH:WIDTH-t.pad*2-(card?card.pad*2:0);
  const s=Math.min(avail/im.naturalWidth,maxH/im.naturalHeight,bleed?Infinity:1.6);
  const w=im.naturalWidth*s,h=im.naturalHeight*s,boxH=h+(card?card.pad*2:0);
  return {height:boxH,draw:(c,y)=>{
    if(card){c.fillStyle=t.card;roundRect(c,t.pad,y,WIDTH-t.pad*2,boxH,t.radius);c.fill();}
    c.save();if(t.radius&&!card&&!bleed){roundRect(c,(WIDTH-w)/2,y,w,h,t.radius);c.clip();}
    c.drawImage(im,(WIDTH-w)/2,y+(card?card.pad:0),w,h);c.restore();
  }};
}

async function pairUnit(ctx,t,items) {
  const gap=18,inner=WIDTH-t.pad*2,colW=(inner-gap)/2,ims=await Promise.all(items.map(x=>loadImage(x.src)));
  const h=Math.min(560,...ims.map(im=>colW/im.naturalWidth*im.naturalHeight));
  const labels=items.map(x=>x.label?textUnit(ctx,t,{value:x.label,font:'body',size:t.tag.size,lh:1.6,ls:t.tag.ls,color:t.muted,upper:t.tag.upper,width:colW,align:'left'}):null);
  const lab=Math.max(0,...labels.map(l=>l?l.height+12:0));
  return {height:h+lab,draw:(c,y)=>{
    ims.forEach((im,k)=>{const x=t.pad+k*(colW+gap),s=Math.min(colW/im.naturalWidth,h/im.naturalHeight),w=im.naturalWidth*s,ih=im.naturalHeight*s;
      c.fillStyle='#ffffff';c.fillRect(x,y,colW,h);c.drawImage(im,x+(colW-w)/2,y+(h-ih)/2,w,ih);labels[k]?.draw(c,y+h+12,x);});
  }};
}

function sectionUnit(ctx,t,u) {
  const inner=WIDTH-t.pad*2,st=t.section;
  if(st.style==='rule'){
    const title=textUnit(ctx,t,{value:u.value,font:'en',size:st.size,lh:1.3,color:t.text});
    return {height:title.height+30,draw:(c,y)=>{title.draw(c,y);c.fillStyle=t.text;c.fillRect((WIDTH-36)/2,y+title.height+18,36,1);}};
  }
  if(st.style==='caps'){
    const title=textUnit(ctx,t,{value:u.value,font:'en',size:st.size,lh:1.3,ls:st.ls||6,color:t.text,upper:true});
    return {height:title.height,draw:(c,y)=>title.draw(c,y)};
  }
  if(st.style==='pill'){
    const f=t.fonts.title;setFont(ctx,f,st.size,1);const lines=wrap(ctx,u.value,inner-60);
    const w=Math.min(inner,Math.max(...lines.map(l=>ctx.measureText(l).width))+64),h=lines.length*st.size*1.4+26;
    return {height:h,draw:(c,y)=>{c.fillStyle=t.accent;roundRect(c,(WIDTH-w)/2,y,w,h,h/2);c.fill();setFont(c,f,st.size,1);c.fillStyle='#ffffff';lines.forEach((l,i)=>c.fillText(l,textX(c,l,'center',0,WIDTH),y+13+i*st.size*1.4+st.size*.2));}};
  }
  // big: 번호 + 굵은 영문 제목 + 굵은 선
  const num=textUnit(ctx,t,{value:String(u.index).padStart(2,'0'),font:'num',size:st.num||22,lh:1.3,color:t.muted});
  const title=textUnit(ctx,t,{value:u.value,font:'en',size:st.size,lh:1.08,ls:-1,color:t.text});
  return {height:num.height+6+title.height+22,draw:(c,y)=>{num.draw(c,y);title.draw(c,y+num.height+6);c.fillStyle=t.line;c.fillRect(t.pad,y+num.height+6+title.height+14,inner,4);}};
}

// COLOR CHOICE(015): 같은 옷 다른 색상의 정면 사진을 작게 모아 보여 주고 아래에 색 이름을 씁니다. 한 줄에 최대 3장(4장이면 2장씩).
export const colorColumns=(n,max=3)=>n===4?2:Math.min(max,n);
async function colorsUnit(ctx,t,items) {
  const st=t.colors||{cols:3,gap:20,name:28},cols=colorColumns(items.length,st.cols),inner=WIDTH-t.pad*2,colW=(inner-st.gap*(cols-1))/cols,boxH=Math.round(colW*4/3);
  const ims=await Promise.all(items.map(x=>loadImage(x.src)));
  const names=items.map(x=>textUnit(ctx,t,{value:x.name||' ',font:'body',size:st.name,lh:1.5,ls:1,color:t.soft,width:colW,align:'center'}));
  const rowsN=Math.ceil(items.length/cols),nameH=Math.max(...names.map(n=>n.height)),rowH=boxH+14+nameH;
  return {height:rowsN*rowH+(rowsN-1)*st.gap,draw:(c,y)=>{
    items.forEach((x,k)=>{const r=Math.floor(k/cols),col=k%cols,inRow=Math.min(cols,items.length-r*cols),off=(inner-(inRow*colW+(inRow-1)*st.gap))/2;
      const bx=t.pad+off+col*(colW+st.gap),by=y+r*(rowH+st.gap),im=ims[k],s=Math.min(colW/im.naturalWidth,boxH/im.naturalHeight),w=im.naturalWidth*s,h=im.naturalHeight*s;
      c.fillStyle='#ffffff';c.fillRect(bx,by,colW,boxH);c.drawImage(im,bx+(colW-w)/2,by+(boxH-h)/2,w,h);
      names[k].draw(c,by+boxH+14,bx);});
  }};
}
// INFO(015): 소재·세탁·핏 짧은 표(왼쪽 항목 이름, 오른쪽 입력값). 머리글 줄은 없습니다.
function infoUnit(ctx,t,rows) {
  const size=(t.info||t.table).size,inner=WIDTH-t.pad*2,keyW=Math.round(inner*.24),valW=inner-keyW-16,lh=size*1.6;
  setFont(ctx,t.fonts.body,size);
  const cells=rows.map(([k,v])=>[wrap(ctx,k,keyW),wrap(ctx,v,valW)]),heights=cells.map(([a,b])=>Math.max(a.length,b.length)*lh+30);
  return {height:heights.reduce((a,b)=>a+b,0),draw:(c,y)=>{
    let top=y;c.fillStyle=t.text;c.fillRect(t.pad,y,inner,1);
    cells.forEach(([k,v],r)=>{setFont(c,t.fonts.head,size);c.fillStyle=t.text;k.forEach((line,l)=>c.fillText(line,t.pad,top+15+l*lh+(lh-size)/2));
      setFont(c,t.fonts.body,size);c.fillStyle=t.soft;v.forEach((line,l)=>c.fillText(line,t.pad+keyW+16,top+15+l*lh+(lh-size)/2));
      top+=heights[r];c.fillStyle=t.line;c.fillRect(t.pad,top-1,inner,1);});
  }};
}

function tableUnit(ctx,t,u) {
  const st=t.table,inner=WIDTH-t.pad*2-(st.style==='card'?40:0),cellW=inner/u.headers.length,f=t.fonts.body,size=st.size,lh=size*1.6;
  setFont(ctx,f,size);const cells=[u.headers,...u.rows].map(row=>row.map(v=>wrap(ctx,v,cellW-12)));
  const heights=cells.map(row=>Math.max(...row.map(l=>l.length))*lh+26),body=heights.reduce((a,b)=>a+b,0),pad=st.style==='card'?20:0;
  return {height:body+pad*2,draw:(c,y)=>{
    const x0=t.pad+pad;let top=y+pad;
    if(st.style==='card'){c.fillStyle=t.card;roundRect(c,t.pad,y,WIDTH-t.pad*2,body+pad*2,t.radius);c.fill();}
    cells.forEach((row,r)=>{
      const h=heights[r],head=r===0;
      if(st.style==='bold'&&head){c.fillStyle=t.text;c.fillRect(x0,top,inner,h);}
      if(st.style==='card'&&head){c.fillStyle=t.accentSoft;roundRect(c,x0,top,inner,h,14);c.fill();}
      row.forEach((lines,col)=>{const x=x0+col*cellW;setFont(c,f,size);if(head)setFont(c,t.fonts.head,size);
        c.fillStyle=st.style==='bold'&&head?'#ffffff':head?t.text:t.soft;
        lines.forEach((line,l)=>c.fillText(line,x+(cellW-c.measureText(line).width)/2,top+13+l*lh+(lh-size)/2));});
      top+=h;
      c.fillStyle=st.style==='lines'&&(r===0)?t.text:t.line;
      if(!(st.style==='card'&&r===cells.length-1))c.fillRect(x0,top-1,inner,st.style==='bold'&&r===0?0:1);
    });
    if(st.style==='lines'){c.fillStyle=t.text;c.fillRect(x0,y,inner,1);}
  }};
}

async function layoutUnit(ctx,t,u) {
  switch(u.type){
    case 'hero':return photoUnit(t,u.src,{bleed:t.hero.bleed,maxH:t.hero.maxH,card:t.photo.card});
    case 'photo':{const p=await photoUnit(t,u.src,{bleed:Boolean(t.photo.bleed),maxH:t.photo.maxH,card:t.photo.card});if(!u.label)return p;const l=textUnit(ctx,t,{value:u.label,font:'body',size:t.tag.size,lh:1.6,ls:t.tag.ls,color:t.muted,upper:t.tag.upper});return {height:p.height+12+l.height,draw:(c,y)=>{p.draw(c,y);l.draw(c,y+p.height+12);}};}
    case 'guide':return photoUnit(t,u.src,{maxH:t.bigGuide?620:420,card:t.photo.card});
    case 'pair':return pairUnit(ctx,t,u.items);
    case 'colors':return colorsUnit(ctx,t,u.items);
    case 'info':return infoUnit(ctx,t,u.rows);
    case 'brand':return textUnit(ctx,t,{value:u.value,font:'brand',size:t.brand.size,lh:1.3,ls:t.brand.ls,color:t.text,upper:true});
    case 'intro':return textUnit(ctx,t,{value:u.value,font:'body',size:(t.intro||t.body).size,lh:(t.intro||t.body).lh,color:t.soft});
    case 'tagline':return textUnit(ctx,t,{value:u.value,font:'body',size:(t.tagline||t.tag).size,lh:(t.tagline||{lh:1.6}).lh,ls:(t.tagline||t.tag).ls,color:t.muted});
    case 'section':return sectionUnit(ctx,t,u);
    case 'table':return tableUnit(ctx,t,u);
    case 'headline':return textUnit(ctx,t,{value:u.value,font:'title',size:t.headline.size,lh:t.headline.lh,ls:t.headline.ls,color:t.text});
    case 'product':return textUnit(ctx,t,{value:u.value,font:'body',size:t.product.size,lh:t.product.lh,color:t.muted});
    case 'caption':return textUnit(ctx,t,{value:u.value,font:'body',size:t.caption.size,lh:t.caption.lh,color:t.soft});
    case 'note':return textUnit(ctx,t,{value:u.value,font:'body',size:t.note.size,lh:t.note.lh,color:t.muted});
    case 'label':return textUnit(ctx,t,{value:u.value,font:'body',size:t.tag.size,lh:1.6,ls:t.tag.ls,color:t.muted,upper:t.tag.upper});
    default:return textUnit(ctx,t,{value:u.value,font:'body',size:t.body.size,lh:t.body.lh,color:t.soft});
  }
}

// 단위 사이 간격: 제목 앞은 넓게, 이름표와 사진 사이는 좁게.
const spaceBefore=(t,u,prev)=>!prev?(t.hero.bleed&&u.type==='hero'?0:t.pad*.6+(u.type==='hero'?t.hero.top:0)):u.type==='section'?t.gap*2.2:prev.type==='label'?14:prev.type==='section'?t.gap*.9:t.gap;

const units_text=blocks=>blocks.filter(b=>b.role==='section').map((_,i)=>String(i+1).padStart(2,'0')).join('')+'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export async function renderThemed(blocks,themeId) {
  const t=themeOf(themeId);
  const text=blocks.map(b=>[b.value,b.headers?.join(''),b.rows?.flat().join(''),b.items?.map(x=>x.name).join(''),b.kind==='image'?b.label:''].filter(Boolean).join('')).join('')+units_text(blocks);
  const fontsOk=await ensureThemeFonts(t,text);
  await document.fonts.ready;
  const measure=document.createElement('canvas').getContext('2d'),units=themeUnits(blocks,t),laid=[];
  let y=0;
  for(let i=0;i<units.length;i++){const l=await layoutUnit(measure,t,units[i]);y+=spaceBefore(t,units[i],units[i-1]);laid.push({y,l});y+=l.height;}
  const height=Math.ceil(y+t.pad*1.2);
  if(height>30000)throw new Error('상세페이지가 너무 깁니다. 사진이나 문구를 줄이거나 HTML로 저장하세요.');
  const c=document.createElement('canvas');c.width=WIDTH;c.height=height;const ctx=c.getContext('2d');if(!ctx)throw new Error('이미지 저장 공간이 부족합니다.');
  ctx.fillStyle=t.bg;ctx.fillRect(0,0,WIDTH,height);ctx.textBaseline='top';
  for(const {y,l} of laid)l.draw(ctx,y);
  const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('이미지 저장에 실패했습니다. HTML로 저장하거나 사진 수를 줄여주세요.');
  return {blob,fontsOk};
}

// ── HTML ────────────────────────────────────────────────────
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// HTML 글자 크기: 860px 폭에서는 PNG와 같은 px, 더 좁은 화면(휴대폰)에서는 PNG가 줄어드는 비율과 똑같이 줄어듭니다.
const fs=size=>`min(${size}px,${(size/8.6).toFixed(2)}vw)`;
const css=f=>`font-family:${f.family.replace(/"/g,"'")};font-weight:${f.weight};font-style:${f.style||'normal'}`;

export function themedHtml(blocks,title,themeId) {
  const t=themeOf(themeId),units=themeUnits(blocks,t),F=t.fonts;
  const st=t.section,tb=t.table,card=t.photo.card;
  const style=`*{box-sizing:border-box}body{margin:0;background:${t.bg};color:${t.text};${css(F.body)}}
main{max-width:860px;margin:auto;padding:${t.pad*.6}px ${t.pad}px ${t.pad*1.2}px;text-align:${t.align}}
p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 ${t.gap}px}
img{display:block;max-width:100%;margin:0 auto}
.u{margin:0 0 ${t.gap}px}
.hero{margin:${t.hero.top}px ${t.hero.bleed?`-${t.pad}px`:'0'} ${t.gap}px}${t.hero.bleed?`.hero img{width:100%;max-height:none}main{padding-top:0}`:''}
.hero img,.photo img{max-height:${t.photo.maxH}px;object-fit:contain${t.radius&&!card?`;border-radius:${t.radius}px`:''}}
${card?`.hero,.photo,.guide{background:${t.card};border-radius:${t.radius}px;padding:${card.pad}px}`:''}
.guide img{max-height:${t.bigGuide?620:420}px${t.bigGuide?';width:100%':''}}
.headline{${css(F.title)};font-size:${fs(t.headline.size)};line-height:${t.headline.lh};letter-spacing:${t.headline.ls}px;color:${t.text}}
.body{font-size:${fs(t.body.size)};line-height:${t.body.lh};color:${t.soft}}
.product{font-size:${fs(t.product.size)};line-height:${t.product.lh};color:${t.muted}}
.caption{font-size:${fs(t.caption.size)};line-height:${t.caption.lh};color:${t.soft}}
.note{font-size:${fs(t.note.size)};line-height:${t.note.lh};color:${t.muted}}
.label{font-size:${fs(t.tag.size)};letter-spacing:${t.tag.ls}px;color:${t.muted};margin:0 0 14px;${t.tag.upper?'text-transform:uppercase':''}}
.photo .label{margin:12px 0 0}
.section{margin-top:${t.gap*2.2}px;margin-bottom:${t.gap*.9}px}
${st.style==='rule'?`.section h2{${css(F.en)};font-size:${fs(st.size)};line-height:1.3;margin:0}.section:after{content:'';display:block;width:36px;height:1px;background:${t.text};margin:18px auto 0}`:''}
${st.style==='pill'?`.section h2{display:inline-block;${css(F.title)};font-size:${fs(st.size)};letter-spacing:1px;background:${t.accent};color:#fff;border-radius:999px;padding:13px 32px;margin:0}`:''}
${st.style==='big'?`.section .num{${css(F.num)};font-size:${fs(st.num||22)};color:${t.muted}}.section h2{${css(F.en)};font-size:${fs(st.size)};line-height:1.08;letter-spacing:-1px;margin:6px 0 0;padding-bottom:14px;border-bottom:4px solid ${t.line}}`:''}
${t.brand?`main{padding-top:${t.pad*.6}px}`:''}
.brand{${css(F.brand||F.head)};font-size:${fs(t.brand?.size||30)};letter-spacing:${t.brand?.ls||0}px;text-transform:uppercase;color:${t.text};margin:0 0 ${t.gap*.6}px}
.intro{font-size:${fs(t.intro?.size||t.body.size)};line-height:${t.intro?.lh||t.body.lh};color:${t.soft}}
.tagline{font-size:${fs(t.tagline?.size||t.tag.size)};line-height:${t.tagline?.lh||1.6};letter-spacing:${t.tagline?.ls||0}px;color:${t.muted}}
${t.photo.bleed?`.photo{margin-left:-${t.pad}px;margin-right:-${t.pad}px}.photo img{width:100%}`:''}
${st.style==='caps'?`.section h2{${css(F.en)};font-size:${fs(st.size)};line-height:1.3;letter-spacing:${st.ls||6}px;text-transform:uppercase;margin:0}`:''}
.colors{display:flex;flex-wrap:wrap;justify-content:center;gap:${t.colors?.gap||20}px}.colors figure{margin:0;flex:0 0 calc((100% - ${(t.colors?.gap||20)*2}px)/3)}.colors.c2 figure{flex-basis:calc((100% - ${t.colors?.gap||20}px)/2)}.colors .sw{aspect-ratio:3/4;background:#fff;display:flex;align-items:center;justify-content:center}.colors img{max-width:100%;max-height:100%;object-fit:contain}.colors figcaption{margin-top:14px;font-size:${fs(t.colors?.name||28)};letter-spacing:1px;color:${t.soft};line-height:1.5}
.info{width:100%;border-collapse:collapse;text-align:left;font-size:${fs(t.info?.size||28)};border-top:1px solid ${t.text}}.info th,.info td{text-align:left;padding:15px 0;border-bottom:1px solid ${t.line};vertical-align:top;line-height:1.6}.info th{width:24%;padding-right:16px;color:${t.text}}.info td{color:${t.soft};white-space:pre-wrap}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px;text-align:left}.pair figure{margin:0}.pair img{width:100%;height:auto;max-height:560px;object-fit:contain;background:#fff}.pair figcaption{margin-top:12px}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:${fs(tb.size)}}
td,th{padding:13px 6px;text-align:center;overflow-wrap:anywhere;color:${t.soft}}th{color:${t.text};${css(F.head)}}
${tb.style==='lines'?`table{border-top:1px solid ${t.text}}th{border-bottom:1px solid ${t.text}}td{border-bottom:1px solid ${t.line}}`:''}
${tb.style==='card'?`.tablewrap{background:${t.card};border-radius:${t.radius}px;padding:20px}th{background:${t.accentSoft}}th:first-child{border-radius:14px 0 0 14px}th:last-child{border-radius:0 14px 14px 0}tr+tr td{border-top:1px solid ${t.line}}`:''}
${tb.style==='bold'?`th{background:${t.text};color:#fff}td{border-bottom:1px solid #dddddd}`:''}
@media(max-width:600px){main{padding-left:20px;padding-right:20px}${t.hero.bleed?'.hero{margin-left:-20px;margin-right:-20px}':''}${t.photo.bleed?'.photo{margin-left:-20px;margin-right:-20px}':''}}`;
  const label=v=>`<p class="label">${esc(v)}</p>`;
  const html=units.map(u=>{
    switch(u.type){
      case 'hero':return `<div class="hero"><img src="${esc(u.src)}" alt="${esc(u.alt)}"></div>`;
      case 'photo':return `<div class="photo u"><img src="${esc(u.src)}" alt="${esc(u.alt)}">${u.label?label(u.label):''}</div>`;
      case 'guide':return `<div class="guide u"><img src="${esc(u.src)}" alt="${esc(u.alt)}"></div>`;
      case 'pair':return `<div class="pair u">${u.items.map(x=>`<figure><img src="${esc(x.src)}" alt="${esc(x.alt)}">${x.label?`<figcaption class="label">${esc(x.label)}</figcaption>`:''}</figure>`).join('')}</div>`;
      case 'section':return `<div class="section">${st.style==='big'?`<div class="num">${String(u.index).padStart(2,'0')}</div>`:''}<h2>${esc(u.value)}</h2></div>`;
      case 'table':return `<div class="tablewrap u"><table><thead><tr>${u.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${u.rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      case 'label':return label(u.value);
      case 'brand':return `<p class="brand">${esc(u.value)}</p>`;
      case 'colors':return `<div class="colors u${colorColumns(u.items.length,t.colors?.cols)===2?' c2':''}">${u.items.map(x=>`<figure><div class="sw"><img src="${esc(x.src)}" alt="${esc(x.name)}"></div><figcaption>${esc(x.name)}</figcaption></figure>`).join('')}</div>`;
      case 'info':return `<div class="u"><table class="info"><tbody>${u.rows.map(([k,v])=>`<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div>`;
      default:return `<p class="${esc(u.type)}">${esc(u.value)}</p>`;
    }
  }).join('\n');
  const font=googleFontsUrl(t);
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${font?`<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${esc(font)}">`:''}<style>${style}</style><body data-theme="${t.id}"><main>${html}</main></body></html>`;
}
