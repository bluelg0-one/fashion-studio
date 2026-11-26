// 앱 방식(014 사장님 결정): 옷걸이 v2가 기본입니다. 상품마다 '옷걸이 정면'·'옷걸이 후면' 2장만 찍고, 디테일컷은 이 2장에서 잘라 만듭니다.
// 예전 마네킹 방식(v1) 화면은 지우지 않고 숨겨 둡니다. 주소 끝에 ?v1 을 붙이면 예전 화면이 열립니다(옛 화면 검사용, 데이터는 같은 브라우저 저장소).
// 브라우저 밖(서버·node 검사)에서는 v2로 봅니다.
export const HANGER_V2=!(typeof location!=='undefined'&&new URLSearchParams(location.search||'').has('v1'));
