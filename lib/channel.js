// 채널: 뚜구리툰(인스타툰) / AI 카드뉴스. 인스타 계정도 따로다.
// 지금 보는 채널은 쿠키 'channel' 에 둔다 (서버 화면·성과 페이지도 알 수 있게).

export const CHANNELS = {
  toon: { id: 'toon', label: '인스타툰', sub: '뚜구리툰', icon: '🎨', contentType: 'instatoon', mark: '뚜' },
  card: { id: 'card', label: '카드뉴스', sub: 'AI 소식', icon: '📰', contentType: 'cardnews', mark: 'AI' },
};
export const CHANNEL_COOKIE = 'channel';

export const normChannel = (v) => (v === 'card' ? 'card' : 'toon');

/** 채널별 인스타 계정. card 는 CARD_ 로 시작하는 환경변수를 쓴다 */
export function igAccount(channel = 'toon') {
  const p = channel === 'card' ? 'CARD_' : '';
  return {
    channel,
    token: process.env[`${p}IG_ACCESS_TOKEN`] || '',
    userId: process.env[`${p}IG_USER_ID`] || '',
    expires: process.env[`${p}TOKEN_EXPIRES_AT`] || '',
    since: process.env[`${p}SINCE_DATE`] || '',
    tokenVar: `${p}IG_ACCESS_TOKEN`,
  };
}
