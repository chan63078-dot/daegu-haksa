// 대구지점 학사관리 설정
// SUPABASE_URL / SUPABASE_ANON_KEY 를 비워두면 데모 모드(이 브라우저에만 저장)로 동작합니다.
// 실제 운영: Supabase 프로젝트를 만들고 supabase/schema.sql 실행 후 두 값을 채우세요.
// anon public 키만 넣으세요. service_role 키는 절대 넣지 마세요.
window.HAKSA_CONFIG = {
  SUPABASE_URL: 'https://kcearusumvfwoviotypd.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_fm5_XhfRfXQH2bpPcDjGHw_5rL_-I6u',  // publishable 키 (공개용)
  ACADEMY_NAME: '코리아AI아카데미 대구점',
  // 2026-11-26: Netlify 사용량 초과(~12/2) 동안 새로 만드는 학생 링크는 GitHub Pages 주소로 (Netlify 가 다시 올라오면 그 주소가 Netlify 로 자동 이동)
  SITE_URL: 'https://chan63078-dot.github.io/daegu-haksa/'   // 학생 링크·안내 문구에 쓰는 공식 주소
};
