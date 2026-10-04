import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { middleware } from './server/studio.js'
export default defineConfig(({mode}) => {
  const local = loadEnv(mode,process.cwd(),'OPENAI_');
  for (const [key,value] of Object.entries(local)) if (!process.env[key]) process.env[key]=value;
  return {plugins:[react(),{name:'studio-api',configureServer(server){server.middlewares.use((req,res,next)=>{
    if(req.url?.startsWith('/api/studio?')) req.url='/api/studio/'+new URL(req.url,'http://localhost').searchParams.get('action');
    return middleware(req,res,next);
  });}}]};
});
