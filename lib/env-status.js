// 설정 화면·작업실에서 쓰는 연결 상태. 값 자체는 절대 내보내지 않고 있음/없음만 알려준다.
export function envStatus() {
  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const aiKey = provider === 'claude' ? process.env.ANTHROPIC_API_KEY : process.env.GEMINI_API_KEY;
  const expires = process.env.TOKEN_EXPIRES_AT || '';
  const daysLeft = expires ? Math.ceil((Date.parse(`${expires}T00:00:00+09:00`) - Date.now()) / 86400000) : null;
  return {
    ai: {
      provider,
      ready: Boolean(aiKey),
      model: provider === 'claude' ? process.env.CLAUDE_MODEL || '' : process.env.GEMINI_MODEL || '',
    },
    notion: { ready: Boolean(process.env.NOTION_TOKEN && process.env.NOTION_DATA_SOURCE_ID) },
    instagram: {
      ready: Boolean(process.env.IG_ACCESS_TOKEN && process.env.IG_USER_ID),
      expires,
      daysLeft,
      since: process.env.SINCE_DATE || '',
    },
    cron: Boolean(process.env.CRON_SECRET),
    password: Boolean(process.env.DASHBOARD_PASSWORD),
  };
}
