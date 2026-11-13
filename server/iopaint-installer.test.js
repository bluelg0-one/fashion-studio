import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildInstaller, DIR, EMBED} from '../scripts/sync-iopaint-installer.mjs';

const bat=fs.readFileSync(new URL('install-iopaint.bat',DIR),'utf8');

test('설치 파일 안의 BiRefNet 서버·시작 파일이 원본과 같다 (다르면 npm run sync:iopaint)',()=>{
  assert.equal(bat,buildInstaller());
  // 설치 파일이 쓰는 것과 같은 규칙(Python re, MULTILINE|DOTALL)으로 꺼내 봅니다.
  const found=[...bat.matchAll(/^#==FILE:(\S+)==#\r?\n([\s\S]*?)^#==END==#/gm)].map(m=>[m[1],m[2]]);
  assert.deepEqual(found.map(f=>f[0]),EMBED);
  for(const [name,body] of found)assert.equal(body.replace(/\r\n/g,'\n'),fs.readFileSync(new URL(name,DIR),'utf8').replace(/\r\n/g,'\n').replace(/\n*$/,'\n'));
});

test('Windows 배치 파일은 CRLF·ASCII이고, 바로가기는 BiRefNet까지 켜는 시작 파일을 가리킨다',()=>{
  for(const name of ['install-iopaint.bat','start-iopaint.bat']){
    const s=fs.readFileSync(new URL(name,DIR),'utf8');
    assert.ok(!/[^\x00-\x7f]/.test(s),`${name}: ASCII만`);
    assert.ok(!/[^\r]\n/.test(s),`${name}: CRLF`);
  }
  assert.match(bat,/\$s\.TargetPath='%DIR%\\start-iopaint\.bat'/);
  assert.match(bat,/pip install "kornia==0\.9\.0" timm einops/);
  const start=fs.readFileSync(new URL('start-iopaint.bat',DIR),'utf8');
  assert.match(start,/start "" \/b "%DIR%\\venv\\Scripts\\python\.exe" "%DIR%\\birefnet_server\.py"/);
  assert.match(start,/iopaint\.exe" start --model lama --device cpu --host 127\.0\.0\.1 --port 8080/);
});
