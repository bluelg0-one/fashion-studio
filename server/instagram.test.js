import test from 'node:test';
import assert from 'node:assert/strict';
import {instagram, blobStore, countHashtags} from './instagram.js';

// 실제 인스타그램·Vercel Blob을 부르지 않고, 요청 형식과 순서만 검사합니다.
const env={INSTAGRAM_ACCESS_TOKEN:'ig-test-token',INSTAGRAM_POST_PASSWORD:'open-sesame',BLOB_READ_WRITE_TOKEN:'blob-test'};
const password='open-sesame',noDelay=async()=>{};
// 가장 작은 JPG 머리말(SOI + SOF0)로 가로·세로만 담습니다.
const jpeg=(width,height)=>{const b=Buffer.alloc(24);b[0]=0xff;b[1]=0xd8;b[2]=0xff;b[3]=0xc0;b.writeUInt16BE(17,4);b[6]=8;b.writeUInt16BE(height,7);b.writeUInt16BE(width,9);return 'data:image/jpeg;base64,'+b.toString('base64');};
const blobUrl=n=>`https://abc123.public.blob.vercel-storage.com/instagram/${n}-x.jpg`;
function fakeStore() {
  const real=blobStore(env),state={put:[],deleted:[],swept:0};
  return {state,store:{owns:real.owns,async put(name,buffer){state.put.push({name,bytes:buffer.length});return blobUrl(state.put.length);},async del(urls){state.deleted.push(...urls);},async sweep(){state.swept++;return 0;}}};
}
const json=(data,ok=true,status=200)=>({ok,status,json:async()=>data});
function fakeGraph(overrides={}) {
  const calls=[];let container=0;
  const request=async(url,options={})=>{
    const u=new URL(url),body=options.body?JSON.parse(options.body):null;
    calls.push({method:options.method||'GET',path:u.pathname.replace('/v25.0',''),query:Object.fromEntries(u.searchParams),body,auth:options.headers?.Authorization});
    for(const [pattern,reply] of Object.entries(overrides))if(u.pathname.endsWith(pattern))return reply(body,u);
    if(u.pathname.endsWith('/me'))return json({user_id:'1789',username:'testshop'});
    if(u.pathname.endsWith('/media_publish'))return json({id:'555'});
    if(u.pathname.endsWith('/media'))return json({id:`c${++container}`});
    if(u.pathname.endsWith('/content_publishing_limit'))return json({data:[{quota_usage:3,config:{quota_total:50}}]});
    if(u.searchParams.get('fields')==='permalink')return json({permalink:'https://www.instagram.com/p/TEST/'});
    return json({status_code:'FINISHED'});
  };
  return {calls,request};
}

test('status shows only which settings exist, never their values',async()=>{
  assert.deepEqual(await instagram('status',{},{},undefined,null),{ready:false,token:false,storage:false,password:false});
  const full=await instagram('status',{},env);
  assert.deepEqual(full,{ready:true,token:true,storage:true,password:true});
  assert.ok(!JSON.stringify(full).includes('ig-test-token'));
});

test('nothing is posted without the right password, and never when no password is set',async()=>{
  const {store}=fakeStore(),unexpected=()=>{throw Error('unexpected request');};
  for(const action of ['check','upload','publish']){
    await assert.rejects(instagram(action,{password:'wrong'},env,unexpected,store,noDelay),{status:401});
    await assert.rejects(instagram(action,{},env,unexpected,store,noDelay),{status:401});
    await assert.rejects(instagram(action,{password:''},{...env,INSTAGRAM_POST_PASSWORD:''},unexpected,store,noDelay),{status:503});
  }
  await assert.rejects(instagram('delete',{password},env,unexpected,store,noDelay),{status:400});
});

test('upload accepts only JPG in the allowed shape and stores it publicly',async()=>{
  const {store,state}=fakeStore();
  const result=await instagram('upload',{password,image:jpeg(1080,1350)},env,undefined,store,noDelay);
  assert.deepEqual(result,{url:blobUrl(1),width:1080,height:1350});
  assert.equal(state.swept,1);
  for(const image of ['data:image/png;base64,aGVsbG8=','https://example.com/a.jpg',jpeg(1080,1920),jpeg(2400,1000),'data:image/jpeg;base64,'+'A'.repeat(4_300_000)])
    await assert.rejects(instagram('upload',{password,image},env,undefined,store,noDelay),{status:400});
  assert.equal(state.put.length,1);
  await assert.rejects(instagram('upload',{password,image:jpeg(1080,1350)},env,undefined,null,noDelay),{status:503});
});

test('several photos are posted as one carousel in order, then removed from storage',async()=>{
  const {store,state}=fakeStore(),{calls,request}=fakeGraph(),urls=[blobUrl(1),blobUrl(2),blobUrl(3)];
  const result=await instagram('publish',{password,caption:' 긴팔티 #여성의류 ',urls},env,request,store,noDelay);
  assert.deepEqual(result,{id:'555',permalink:'https://www.instagram.com/p/TEST/',username:'testshop',count:3});
  const posts=calls.filter(c=>c.method==='POST');
  assert.deepEqual(posts.map(c=>c.path),['/1789/media','/1789/media','/1789/media','/1789/media','/1789/media_publish']);
  assert.deepEqual(posts.slice(0,3).map(c=>c.body),urls.map(url=>({image_url:url,is_carousel_item:true})));
  assert.deepEqual(posts[3].body,{media_type:'CAROUSEL',children:'c1,c2,c3',caption:'긴팔티 #여성의류'});
  assert.deepEqual(posts[4].body,{creation_id:'c4'});
  assert.ok(calls.every(c=>c.auth==='Bearer ig-test-token'&&!JSON.stringify([c.path,c.query]).includes('ig-test-token')));
  assert.deepEqual(state.deleted,urls);
});

test('a single photo is posted without a carousel',async()=>{
  const {store}=fakeStore(),{calls,request}=fakeGraph();
  await instagram('publish',{password,caption:'한 장',urls:[blobUrl(1)]},env,request,store,noDelay);
  assert.deepEqual(calls.filter(c=>c.method==='POST').map(c=>c.body),[{image_url:blobUrl(1),caption:'한 장'},{creation_id:'c1'}]);
});

test('publish refuses foreign image addresses, too many photos, long captions and too many hashtags',async()=>{
  const {store}=fakeStore(),unexpected=()=>{throw Error('unexpected request');};
  const bad=[
    {urls:[]},{urls:Array.from({length:11},(_,i)=>blobUrl(i))},{urls:['https://example.com/a.jpg']},{urls:['https://evil.example/instagram/a.jpg?x=.public.blob.vercel-storage.com']},
    {urls:['https://abc.public.blob.vercel-storage.com/other/a.jpg']},{urls:[blobUrl(1),blobUrl(1)]},
    {urls:[blobUrl(1)],caption:'가'.repeat(2201)},{urls:[blobUrl(1)],caption:Array.from({length:31},(_,i)=>`#t${i}`).join(' ')},
  ];
  for(const body of bad)await assert.rejects(instagram('publish',{password,caption:'',...body},env,unexpected,store,noDelay),{status:400});
});

test('waits while Instagram is still processing, and stops with photos cleaned up when it fails',async()=>{
  let polls=0;
  const first=fakeStore(),waiting=fakeGraph({'/c1':()=>json({status_code:++polls<3?'IN_PROGRESS':'FINISHED'})});
  await instagram('publish',{password,caption:'',urls:[blobUrl(1)]},env,waiting.request,first.store,noDelay);
  assert.equal(polls,3);
  const second=fakeStore(),failing=fakeGraph({'/c1':()=>json({status_code:'ERROR',status:'Error: 2207052'})});
  await assert.rejects(instagram('publish',{password,caption:'',urls:[blobUrl(1)]},env,failing.request,second.store,noDelay),e=>e.status===502&&/2207052/.test(e.message));
  assert.ok(!failing.calls.some(c=>c.path.endsWith('/media_publish')));
  assert.deepEqual(second.state.deleted,[blobUrl(1)]);
});

test('expired token, rate limit and lost publish response give clear messages without leaking the token',async()=>{
  const {store}=fakeStore(),body={password,caption:'',urls:[blobUrl(1)]};
  const expired=fakeGraph({'/me':()=>json({error:{code:190,message:'Session expired for ig-test-token'}},false,400)});
  await assert.rejects(instagram('publish',body,env,expired.request,store,noDelay),e=>e.status===502&&/토큰/.test(e.message)&&!e.message.includes('ig-test-token'));
  const limited=fakeGraph({'/media_publish':()=>json({error:{code:4,message:'Application request limit reached'}},false,400)});
  await assert.rejects(instagram('publish',body,env,limited.request,store,noDelay),{status:429});
  const lost=fakeGraph({'/media_publish':()=>{throw Error('socket hang up');}});
  await assert.rejects(instagram('publish',body,env,lost.request,store,noDelay),e=>e.status===502&&/게시됐는지 먼저 확인/.test(e.message));
});

test('check reports the connected account and how many posts were made in 24 hours',async()=>{
  const {store}=fakeStore(),{request}=fakeGraph();
  assert.deepEqual(await instagram('check',{password},env,request,store,noDelay),{username:'testshop',used:3,limit:50});
  const wrapped=fakeGraph({'/me':()=>json({data:[{user_id:'42',username:'wrapped'}]}),'/content_publishing_limit':()=>json({},false,500)});
  assert.deepEqual(await instagram('check',{password},env,wrapped.request,store,noDelay),{username:'wrapped',used:null,limit:null});
  await assert.rejects(instagram('check',{password},{...env,INSTAGRAM_ACCESS_TOKEN:''},request,store,noDelay),{status:503});
});

test('hashtags are counted the way the caption limit needs',()=>{
  assert.equal(countHashtags('긴팔티 #여성의류 #데일리룩\n#우아샵'),3);
  assert.equal(countHashtags('해시태그 없음'),0);
});
