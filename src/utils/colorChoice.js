// 같은 옷 다른 색상(015) — 두손 베이직 상세페이지의 COLOR CHOICE에 씁니다.
// 상품마다 data.colorGroup에 같은 묶음 값을 넣어 서로 연결합니다(연결은 사장님이 화면에서 확인하고 누름).
// 자동 분류(옷걸이 v2)가 같은 디자인으로 본 상품은 data.design 값이 같아서 '연결 제안'으로만 보여 줍니다.
export const newColorGroup=()=>'cg-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));

// 연결된 다른 상품(지금 상품 제외)
export const colorMembers=(list,{id,group})=>group?list.filter(p=>p.id!==id&&p.colorGroup===group):[];
// 제안: design이 같은데 아직 같은 묶음이 아닌 상품
export const colorSuggestions=(list,{id,group,design})=>design?list.filter(p=>p.id!==id&&p.design===design&&(!group||p.colorGroup!==group)):[];

// 상세페이지에 넣을 색상 목록. 정면 최종본(slots.hero.image)이 있는 상품만, 색 이름 순서(모든 색상 페이지에서 같은 순서).
// 2색 미만이면 빈 목록 → COLOR CHOICE가 나오지 않습니다. shrink: 작은 사진으로 줄이는 함수(HTML·PNG 크기 절약).
export async function colorChoice({id,group,name,colorName,image},{list,get,shrink=src=>src}) {
  if(!group)return [];
  const items=[{id,name:colorName||name||'',src:image||null,current:true}];
  for(const p of colorMembers(await list(),{id,group})){
    const d=(await get(p.id))?.data;
    items.push({id:p.id,name:d?.texts?.colorName||p.name||'',src:d?.slots?.hero?.image||null,current:false});
  }
  const usable=items.filter(x=>x.src).sort((a,b)=>String(a.name).localeCompare(String(b.name),'ko')||String(a.id).localeCompare(String(b.id)));
  if(usable.length<2)return [];
  return Promise.all(usable.map(async x=>({...x,src:await shrink(x.src)})));
}

// 연결: 지금 상품의 묶음(없으면 새로 만듦)에 대상 상품을 넣습니다. 대상이 다른 묶음에 있었으면 그 묶음 상품도 모두 옮깁니다.
// store = {list, get, save}. 바뀐 묶음 값을 돌려줍니다(지금 상품도 이 값으로 저장해야 함).
export async function linkColor({id,group},targetId,store) {
  const g=group||newColorGroup(),all=await store.list(),target=all.find(p=>p.id===targetId);
  if(!target||targetId===id)return g;
  const move=new Set([targetId,...(target.colorGroup&&target.colorGroup!==g?all.filter(p=>p.colorGroup===target.colorGroup).map(p=>p.id):[])]);
  move.delete(id);
  for(const pid of move){const p=await store.get(pid);if(p)await store.save({...p,data:{...(p.data||{}),colorGroup:g}});}
  return g;
}
export async function unlinkColor(targetId,store) {
  const p=await store.get(targetId);
  if(p)await store.save({...p,data:{...(p.data||{}),colorGroup:null}});
}
