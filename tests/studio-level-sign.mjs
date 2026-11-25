// 자동 수평 회전 방향 검사(013-B): 추정기와 상관없는 '직접 잰 기울기'로, 기울인 사진을 고친 뒤 0°에 가까워지는지 확인합니다.
// 검은 세로 기둥의 x 위치를 위·아래에서 재서 기울기를 계산합니다(+ = 시계 방향으로 기울어짐). 앱 서버 없이 src/utils/level.js만 씁니다.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
try{
 const p=await browser.newPage();await p.goto('about:blank');
 const src=fs.readFileSync(new URL('../src/utils/level.js',import.meta.url),'utf8');
 await p.addScriptTag({type:'module',content:src.replace(/export /g,'')+'\nwindow.L={estimateCanvasTilt,rotateCanvas,decideLevel};'});
 await p.waitForFunction(()=>window.L);
 const rows=await p.evaluate(()=>{
  const W=900,H=1200;
  const scene=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');g.fillStyle='#cdc6ba';g.fillRect(0,0,W,H);g.fillStyle='#968c80';for(let y=0;y<H;y+=40){g.fillRect(0,y,W,5);const off=(y/40)%2?55:0;for(let x=off;x<W;x+=110)g.fillRect(x,y,5,40);}g.fillStyle='#000';g.fillRect(W/2-6,0,12,H);return c;};
  const slope=c=>{const g=c.getContext('2d');const xAt=y=>{const d=g.getImageData(0,y,W,1).data;let s=0,n=0;for(let x=W*.3|0;x<W*.7;x++){const i=x*4;if(d[i]<40&&d[i+1]<40){s+=x;n++;}}return s/n;};return Math.atan2(xAt(300)-xAt(900),600)*180/Math.PI;};
  return [3,-3,1.5,-2.2].map(t=>{const tilted=window.L.rotateCanvas(scene(),t,'#cdc6ba'),est=window.L.estimateCanvasTilt(tilted),d=window.L.decideLevel(est),fixed=window.L.rotateCanvas(tilted,d.angle,'#cdc6ba');
   return {t,before:slope(tilted),angle:d.angle,after:slope(fixed)};});
 });
 for(const r of rows){
  assert.ok(Math.abs(r.before-r.t)<.2,`기울인 사진의 실제 기울기 ${r.before}`);
  assert.ok(Math.sign(r.angle)===-Math.sign(r.t),`보정 각도는 기울기의 반대 방향이어야 함: 기울기 ${r.t}° → 보정 ${r.angle}°`);
  assert.ok(Math.abs(r.after)<.2,`보정 뒤 실제 기울기 ${r.after.toFixed(2)}° (0°에 가까워야 함)`);
 }
 console.log('PASS: rotation sign — '+rows.map(r=>`${r.t}° tilt → correct ${r.angle}° → measured ${r.after.toFixed(2)}°`).join(', '));
}finally{await browser.close();}
