const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 키워드 하나가 글에 들어 있는지. 영문·숫자 키워드는 단어 단위로만 본다 ("AI"가 "mail"에 걸리지 않게). */
function hit(text, keyword) {
  const k = String(keyword || '').trim().toLowerCase();
  if (!k) return false;
  if (/^[\x20-\x7e]+$/.test(k)) return new RegExp(`(^|[^a-z0-9])${esc(k)}([^a-z0-9]|$)`).test(text);
  return text.includes(k);
}

/** 글이 어떤 토픽 키워드에 걸리는지 (토픽: {id, name, keywords[]}) */
export function matchTopics(text, topics) {
  const t = String(text || '').toLowerCase();
  return (topics || []).filter((tp) => (tp.keywords || []).some((k) => hit(t, k)));
}
