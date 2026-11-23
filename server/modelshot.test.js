import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/modelshot.js';
// api/modelshot.js 상태 경로 검사. FASHN을 호출하지 않습니다(fetch가 불리면 실패).
const call=async(body,env={})=>{
 const saved={FASHN_API_KEY:process.env.FASHN_API_KEY,STYLEROOM_API_KEY:process.env.STYLEROOM_API_KEY,fetch:globalThis.fetch};
 delete process.env.FASHN_API_KEY;delete process.env.STYLEROOM_API_KEY;Object.assign(process.env,env);
 globalThis.fetch=()=>{throw new Error('unexpected upstream request');};
 const res={code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};
 try{await handler({method:'POST',headers:{host:'app.test'},body},res);}
 finally{globalThis.fetch=saved.fetch;for(const k of ['FASHN_API_KEY','STYLEROOM_API_KEY'])if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
 return res;
};
test('modelshot config reports only key presence, never the value, without calling FASHN',async()=>{
 let r=await call({action:'config'});
 assert.equal(r.code,200);assert.deepEqual(r.body,{fashn:false,styleroom:false});
 r=await call({action:'config'},{FASHN_API_KEY:'secret-test-value'});
 assert.deepEqual(r.body,{fashn:true,styleroom:false});
 assert.ok(!JSON.stringify(r.body).includes('secret-test-value'));
 assert.equal(r.headers['Cache-Control'],'no-store');
});
test('modelshot ignores the old VITE_FASHN_API_KEY name',async()=>{
 const r=await call({action:'config'},{VITE_FASHN_API_KEY:'old-name'});
 delete process.env.VITE_FASHN_API_KEY;
 assert.equal(r.body.fashn,false);
});
test('modelshot run without key fails before any upstream call',async()=>{
 const r=await call({action:'run',provider:'fashn',model_name:'product-to-model',inputs:{}});
 assert.equal(r.code,500);assert.match(r.body.error,/FASHN_API_KEY/);
});
