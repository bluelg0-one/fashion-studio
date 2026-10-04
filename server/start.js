import http from 'node:http';
import {createReadStream,statSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {middleware} from './studio.js';
const root=resolve('dist');
http.createServer(async(req,res)=>{
 if(req.url.startsWith('/api/studio?'))req.url='/api/studio/'+new URL(req.url,'http://localhost').searchParams.get('action');
 await middleware(req,res,()=>{
  const path=new URL(req.url,'http://localhost').pathname;
  let file=resolve(root,'.'+path);
  if(!file.startsWith(root+'/')&&file!==root){res.statusCode=403;return res.end();}
  try{if(!statSync(file).isFile())file=resolve(root,'index.html');}catch{file=resolve(root,'index.html');}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');
  const stream=createReadStream(file);stream.on('error',()=>{res.statusCode=404;res.end('Build the app first.');});stream.pipe(res);
 });
}).listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1');
