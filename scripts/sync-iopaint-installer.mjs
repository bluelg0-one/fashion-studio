// public/iopaint/install-iopaint.bat 끝에 birefnet_server.py와 start-iopaint.bat를 넣습니다.
// (설치 파일 하나만 받아도 되도록. 두 파일을 고친 뒤 `npm run sync:iopaint`를 실행하세요.)
import fs from 'node:fs';
export const DIR=new URL('../public/iopaint/',import.meta.url);
export const EMBED=['birefnet_server.py','start-iopaint.bat'];
const crlf=s=>s.replace(/\r\n/g,'\n').replace(/\n/g,'\r\n');
export function buildInstaller() {
  const head=fs.readFileSync(new URL('install-iopaint.bat',DIR),'utf8').split(/\r?\nrem ---- Files copied by the installer/)[0].replace(/\s*$/,'');
  const parts=EMBED.map(n=>`#==FILE:${n}==#\n${fs.readFileSync(new URL(n,DIR),'utf8').replace(/\r\n/g,'\n').replace(/\n*$/,'\n')}#==END==#\n`);
  return crlf(`${head}\n\nrem ---- Files copied by the installer (not run by this script) ----\n${parts.join('')}`);
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1].split('/').pop())){
  fs.writeFileSync(new URL('install-iopaint.bat',DIR),buildInstaller());
  console.log('install-iopaint.bat updated');
}
