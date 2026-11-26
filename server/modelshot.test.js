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
 assert.equal(r.code,200);assert.deepEqual(r.body,{fashn:false,styleroom:false,google:false});
 r=await call({action:'config'},{FASHN_API_KEY:'secret-test-value'});
 assert.deepEqual(r.body,{fashn:true,styleroom:false,google:false});
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

// ---- 017: Google Vertex AI Virtual Try-On 엔진(모의) ----
import {generateKeyPairSync, createVerify} from 'node:crypto';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const CRED=JSON.stringify({type:'service_account',client_email:'vto@test-project.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})});
const IMG='data:image/jpeg;base64,'+Buffer.from('jpeg-bytes').toString('base64');
const callG=async(body,env,upstream)=>{
 const keys=['FASHN_API_KEY','GOOGLE_VTO_CREDENTIALS','GOOGLE_CLOUD_PROJECT','GOOGLE_CLOUD_LOCATION','GOOGLE_VTO_MODEL'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]])),f=globalThis.fetch;
 for(const k of keys)delete process.env[k];Object.assign(process.env,env);
 const calls=[];globalThis.fetch=async(url,opt={})=>{calls.push({url:String(url),opt});return upstream(String(url),opt);};
 const res={code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};
 try{await handler({method:'POST',headers:{host:'app.test'},body},res);}
 finally{globalThis.fetch=f;for(const k of keys)if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
 return {res,calls};
};
const ok=json=>({ok:true,status:200,text:async()=>JSON.stringify(json)});
test('017 google: config reports presence only; person + garment photo → predict with a signed service-account token; result comes back at once',async()=>{
 const env={GOOGLE_VTO_CREDENTIALS:CRED,GOOGLE_CLOUD_PROJECT:'test-project'};
 let {res}=await callG({action:'config'},env,()=>{throw new Error('no upstream');});
 assert.equal(res.body.google,true);assert.equal(res.body.fashn,false);assert.ok(!JSON.stringify(res.body).includes('PRIVATE'));
 ({res}=await callG({action:'config'},{},()=>{throw new Error('no upstream');}));assert.equal(res.body.google,false);
 const out=Buffer.from('png-out').toString('base64');
 const r=await callG({action:'run',provider:'google',inputs:{person_image:IMG,product_image:IMG,sample_count:1}},env,(url,opt)=>{
  if(url==='https://oauth2.googleapis.com/token'){
   const jwt=new URLSearchParams(opt.body).get('assertion'),[h,p,sig]=jwt.split('.');
   assert.ok(createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey,Buffer.from(sig,'base64url')),'서명 확인');
   const claims=JSON.parse(Buffer.from(p,'base64url'));assert.equal(claims.iss,'vto@test-project.iam.gserviceaccount.com');assert.match(claims.scope,/cloud-platform/);
   return ok({access_token:'tok-123',expires_in:3600});}
  assert.equal(url,'https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google/models/virtual-try-on-001:predict');
  assert.equal(opt.headers.Authorization,'Bearer tok-123');
  const b=JSON.parse(opt.body);assert.equal(b.instances[0].personImage.image.bytesBase64Encoded,IMG.split(',')[1]);
  assert.equal(b.instances[0].productImages[0].image.bytesBase64Encoded,IMG.split(',')[1]);assert.equal(b.parameters.sampleCount,1);
  return ok({predictions:[{bytesBase64Encoded:out,mimeType:'image/png'}]});});
 assert.equal(r.res.code,200,JSON.stringify(r.res.body));assert.equal(r.res.body.status,'completed');assert.deepEqual(r.res.body.output,[`data:image/png;base64,${out}`]);
 assert.ok(!JSON.stringify(r.res.body).includes('tok-123'),'토큰은 응답에 없음');
});
test('017 google: missing settings or person photo fail before predict; location/model names are validated; status is not used',async()=>{
 let r=await callG({action:'run',provider:'google',inputs:{person_image:IMG,product_image:IMG}},{},()=>{throw new Error('no upstream');});
 assert.equal(r.res.code,500);assert.match(r.res.body.error,/GOOGLE_VTO_CREDENTIALS/);
 const env={GOOGLE_VTO_CREDENTIALS:CRED,GOOGLE_CLOUD_PROJECT:'p'};
 r=await callG({action:'run',provider:'google',inputs:{product_image:IMG}},env,()=>{throw new Error('no upstream');});
 assert.equal(r.res.code,400);assert.match(r.res.body.error,/기본 모델 사진/);assert.equal(r.calls.length,0);
 r=await callG({action:'run',provider:'google',inputs:{person_image:IMG,product_image:IMG}},{...env,GOOGLE_CLOUD_LOCATION:'us-central1/../x'},()=>{throw new Error('no upstream');});
 assert.equal(r.res.code,500);assert.match(r.res.body.error,/LOCATION/);
 r=await callG({action:'status',provider:'google',id:'x'},env,()=>{throw new Error('no upstream');});assert.equal(r.res.code,400);
 r=await callG({action:'config'},{GOOGLE_VTO_CREDENTIALS:'{not json',GOOGLE_CLOUD_PROJECT:'p'},()=>{throw new Error('no upstream');});assert.equal(r.res.body.google,false);
});
