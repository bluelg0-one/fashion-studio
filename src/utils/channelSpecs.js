// 채널별 사진 규격을 한곳에 모아 둔 파일입니다. 셀러센터 안내가 바뀌면 여기 숫자만 고치면 됩니다.
//
// verified 값의 뜻
//   'official'  : 공식 판매자 가이드·개발자 문서 페이지를 직접 열어 확인한 값 (현재 없음)
//   'search'    : 공식 문서 주소가 검색 결과에 나왔고 그 요약에 수치가 있었지만, 작업 환경에서 페이지를 직접 열지 못한 값
//   'unverified': 공식 값을 찾지 못해 보수적인 기본값(1:1, 1000px 이상, 흰 배경, JPG, 2MB 이하)을 쓴 값
//   'own'       : 외부 규격이 없는 자사몰용. 앱에서 정한 값
// 2026-11-23 작업 환경에서는 smartstore.naver.com·coupangcorp.com·facebook.com 접속이 막혀 있어 'official'로 확인한 값이 없습니다.
//
// 어떤 값이든 실제로 만드는 사진은 보수적인 쪽(흰 배경, JPG, 2MB 이하)으로 맞춥니다.

const MB=1024*1024;

// 보수적인 기본값: 공식 규격을 확인 못 한 채널에 씁니다.
export const SAFE_DEFAULT={ratio:[1,1],size:[1000,1000],maxBytes:2*MB,format:'image/jpeg',background:'#ffffff'};

export const CHANNELS=[
  {
    id:'smartstore',label:'네이버 스마트스토어',folder:'smartstore',
    verified:'unverified',
    note:'공식 대표·추가 이미지 규격을 확인하지 못해 보수적인 기본값을 씁니다. 스마트스토어센터 상품 등록 화면의 안내값과 다르면 알려 주세요.',
    sources:[],
    images:[
      {role:'main',label:'대표 이미지',...SAFE_DEFAULT,maxCount:1},
      // 추가 이미지 장수 상한은 미확인. 쿠팡 상세 이미지(최대 9장)와 같은 보수적인 값으로 둡니다.
      {role:'extra',label:'추가 이미지',...SAFE_DEFAULT,maxCount:9},
    ],
  },
  {
    id:'coupang',label:'쿠팡',folder:'coupang',
    verified:'search',
    // 검색 요약에 나온 공식 문서 기준: 대표이미지(REPRESENTATION) 필수, 정사각형, 3MB 이하, JPG·PNG,
    // 최소 500×500 ~ 최대 5000×5000px, 상세 이미지(DETAIL) 최대 9장.
    // WING 안내 페이지 요약: 권장 1000×1000px 이상, 흰색 배경에 상품만, 10MB 이하(문서마다 용량 기준이 다름 → 더 엄격한 3MB보다도 작은 2MB로 만듦).
    note:'쿠팡 Open API 문서 검색 요약 기준(정사각형, 500~5000px, 3MB 이하, 상세 최대 9장)과 WING 안내(권장 1000px 이상, 흰 배경)를 모두 만족하도록 1000×1000 · 2MB 이하 · 흰 배경으로 만듭니다. 페이지를 직접 열어 확인하지는 못했습니다.',
    sources:[
      'https://developers.coupangcorp.com/hc/ko/articles/37469683829401',
      'https://developers.coupangcorp.com/hc/en-us/articles/360033877853-Product-Creation',
      'https://marketplace.coupang.com/mba/listing',
    ],
    images:[
      {role:'main',label:'대표 이미지',...SAFE_DEFAULT,maxCount:1},
      {role:'extra',label:'추가(상세) 이미지',...SAFE_DEFAULT,maxCount:9},
    ],
  },
  {
    id:'instagram',label:'인스타그램 피드',folder:'instagram',
    verified:'unverified',
    // 06 인스타 패널(instagramExport.js IG_IMAGE)과 같은 값: 세로 4:5, 1080×1350, JPG, 한 게시물 최대 10장.
    note:'06 인스타 패널과 같은 4:5 · 1080×1350 · JPG · 최대 10장입니다. Meta 공식 문서는 이번에 직접 확인하지 못했습니다(용량은 보수적으로 2MB 이하).',
    sources:[],
    images:[
      {role:'feed',label:'피드 사진',ratio:[4,5],size:[1080,1350],maxBytes:2*MB,format:'image/jpeg',background:'#ffffff',maxCount:10},
    ],
  },
  {
    id:'mall',label:'자사몰',folder:'mall',
    verified:'own',
    note:'외부 규격이 없는 자사몰용입니다. 상세용 3:4(1500×2000)와 목록 썸네일 1:1(1000×1000)을 만듭니다. 자사몰 디자인에 맞게 바꿔 쓰세요.',
    sources:[],
    images:[
      {role:'detail',label:'상세 3:4',ratio:[3,4],size:[1500,2000],maxBytes:2*MB,format:'image/jpeg',background:'#ffffff',maxCount:Infinity},
      {role:'thumb',label:'썸네일 1:1',...SAFE_DEFAULT,maxCount:1},
    ],
  },
];

export const VERIFIED_LABEL={official:'공식 확인',search:'검색 요약 기준 · 원문 미열람',unverified:'미확인 · 보수적 기본값',own:'자사몰 자체 기준'};

// 옷 둘레 여백(%) 기본값. 같은 여백으로 가운데 배치합니다.
export const DEFAULT_MARGIN=6;
