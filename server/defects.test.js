import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFECT_LEVELS,callsFor,garmentBox,tileGrid,mapFromTile,mergeRegions,splitBox,splitRegions,TILE_OVERLAP} from '../src/utils/defectTiles.js';
import {defectInstructions,findDefects} from './classify.js';
import {costTimes} from '../src/utils/cost.js';

test('sensitivity: normal 1 call, aggressive 4 (2×2), max 9 (3×3); cost shown per number of calls',()=>{
 assert.deepEqual(Object.keys(DEFECT_LEVELS).map(callsFor),[1,4,9]);
 assert.equal(costTimes('claudeDefects',1),'약 $0.01~0.04 (1회)');
 assert.equal(costTimes('claudeDefects',4),'약 $0.04~0.16 (4회)');
 assert.equal(costTimes('claudeDefects',9),'약 $0.09~0.36 (9회)');
});
test('tiles cover the garment box with at least 15% overlap',()=>{
 const box={x:100,y:50,w:600,h:900};
 for(const n of [2,3]){
  const t=tileGrid(box,n);assert.equal(t.length,n*n);
  assert.equal(Math.min(...t.map(a=>a.x)),100);assert.equal(Math.min(...t.map(a=>a.y)),50);
  assert.ok(Math.abs(Math.max(...t.map(a=>a.x+a.w))-700)<=1);assert.ok(Math.abs(Math.max(...t.map(a=>a.y+a.h))-950)<=1);
  const [a,b]=[t[0],t[1]],ov=(a.x+a.w-b.x)/a.w;assert.ok(ov>=.15,`겹침 ${ov}`);
 }
 assert.ok(TILE_OVERLAP>=.15);
});
test('garment box follows the opaque cutout',()=>{
 const w=200,h=300,data=new Uint8ClampedArray(w*h*4);
 for(let y=40;y<260;y++)for(let x=50;x<150;x++)data[(y*w+x)*4+3]=255;
 const b=garmentBox({data,width:w,height:h});
 assert.ok(b.x<=50&&b.x>=45&&b.y<=40&&b.x+b.w>=149&&b.y+b.h>=259);
});
test('tile coordinates map back to the whole photo and duplicates from overlapping tiles merge',()=>{
 const W=1000,H=2000,tiles=tileGrid({x:0,y:0,w:W,h:H},2);
 // 같은 구김(사진 기준 x 450~550, y 900~1100)을 겹치는 두 타일이 함께 찾음
 const toTile=(t,r)=>({...r,x0:(r.x0/1000*W-t.x)/t.w*1000,x1:(r.x1/1000*W-t.x)/t.w*1000,y0:(r.y0/1000*H-t.y)/t.h*1000,y1:(r.y1/1000*H-t.y)/t.h*1000});
 const real={type:'wrinkle',x0:450,x1:550,y0:450,y1:550,confidence:.7,note:''};
 const a=mapFromTile(toTile(tiles[0],real),tiles[0],W,H),b=mapFromTile({...toTile(tiles[3],real),confidence:.5},tiles[3],W,H);
 for(const k of ['x0','x1','y0','y1']){assert.ok(Math.abs(a[k]-real[k])<=1,k);assert.ok(Math.abs(b[k]-real[k])<=1,k);}
 const far={type:'stain',x0:100,x1:130,y0:100,y1:120,confidence:.9,note:''};
 const merged=mergeRegions([a,b,far]);
 assert.equal(merged.length,2);assert.equal(merged.find(r=>r.type==='wrinkle').confidence,.7);
});
test('wide boxes split into small boxes (≤9% side, 25~30% overlap) that cover the whole box; small boxes and brush strokes stay',()=>{
 const wide={type:'wrinkle',x0:200,x1:500,y0:300,y1:420,confidence:1};
 const parts=splitBox(wide);
 assert.ok(parts.length>1);
 for(const p of parts){assert.ok(p.x1-p.x0<=91&&p.y1-p.y0<=91,`${p.x1-p.x0}×${p.y1-p.y0}`);}
 assert.equal(Math.min(...parts.map(p=>p.x0)),200);assert.equal(Math.max(...parts.map(p=>p.x1)),500);
 assert.equal(Math.min(...parts.map(p=>p.y0)),300);assert.equal(Math.max(...parts.map(p=>p.y1)),420);
 const row=parts.filter(p=>p.y0===300).sort((p,q)=>p.x0-q.x0),ov=(row[0].x1-row[1].x0)/(row[0].x1-row[0].x0);
 assert.ok(ov>=.25&&ov<=.31,`겹침 ${ov.toFixed(2)}`);
 assert.deepEqual(splitBox({x0:10,x1:60,y0:10,y1:60}),[{x0:10,x1:60,y0:10,y1:60}]);
 const stroke={shape:'stroke',x0:0,x1:900,y0:0,y1:900,points:[]};assert.deepEqual(splitBox(stroke),[stroke]);
 assert.equal(splitRegions([wide,stroke]).length,parts.length+1);
});
test('prompt: normal is unchanged, aggressive/max ask for broad creases but still exclude ribbing, seams, pleats, buttons, prints',()=>{
 const n=defectInstructions({level:'normal',W:1,H:1}),a=defectInstructions({level:'aggressive',W:1,H:1}),m=defectInstructions({level:'max',tile:true,W:1,H:1});
 assert.match(n,/Prefer missing a doubtful spot/);assert.doesNotMatch(n,/fold lines/);assert.match(n,/At most 12 regions/);
 for(const p of [a,m]){assert.match(p,/fold lines and storage creases/);assert.match(p,/pressed or crushed wrinkles/);assert.match(p,/knit ribbing/);assert.match(p,/seams and stitching/);assert.match(p,/designed pleats/);assert.match(p,/buttons/);assert.match(p,/prints/);assert.doesNotMatch(p,/Prefer missing/);}
 assert.match(a,/At most 20 regions/);assert.match(m,/At most 25 regions/);assert.match(m,/zoomed-in part of the garment/);assert.match(m,/lower confidence/);
});
test('server passes the sensitivity to Claude and caps the number of boxes (mock client, no real call)',async()=>{
 let sent;const box=i=>({type:'wrinkle',x0:i,y0:i,x1:i+20,y1:i+20,confidence:.6,note:'구김'});
 const client={beta:{messages:{parse:async req=>{sent=req;return {stop_reason:'end_turn',model:'mock',parsed_output:{regions:Array.from({length:30},(_,i)=>box(i*10))}};}}}};
 const img='data:image/jpeg;base64,'+Buffer.from('x').toString('base64');
 const r=await findDefects({image:img,width:800,height:800,level:'aggressive',tile:true},{},client);
 assert.equal(r.regions.length,20);assert.equal(r.level,'aggressive');
 assert.match(sent.messages[0].content[1].text,/fold lines/);assert.match(sent.messages[0].content[1].text,/zoomed-in/);
 const r2=await findDefects({image:img,width:800,height:800,level:'nonsense'},{},client);assert.equal(r2.level,'normal');assert.equal(r2.regions.length,12);
});
