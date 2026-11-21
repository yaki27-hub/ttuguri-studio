// Google 트렌드 실시간 급상승 검색어 (공개 RSS, 키 없음)
const RSS = 'https://trends.google.com/trending/rss';

const decode = (s = '') =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

const tag = (xml, name) => decode(xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? '');

/** 급상승 검색어 목록. traffic 은 "2000+" 를 숫자로 바꾼 값 */
export async function fetchTrending(geo = 'KR') {
  const res = await fetch(`${RSS}?geo=${encodeURIComponent(geo)}`, { next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`Google 트렌드 응답 오류 (HTTP ${res.status})`);
  const xml = await res.text();
  const items = xml.split('<item>').slice(1).map((chunk) => {
    const body = chunk.split('</item>')[0];
    const trafficText = tag(body, 'ht:approx_traffic');
    const news = body
      .split('<ht:news_item>')
      .slice(1)
      .map((n) => ({
        title: tag(n, 'ht:news_item_title'),
        url: tag(n, 'ht:news_item_url'),
        source: tag(n, 'ht:news_item_source'),
      }))
      .filter((n) => n.title && /^https?:\/\//.test(n.url))
      .slice(0, 3);
    const title = tag(body, 'title');
    return {
      title,
      traffic: Number(trafficText.replace(/[^\d]/g, '')) || 0,
      trafficText,
      at: tag(body, 'pubDate'),
      news,
      url: `https://trends.google.com/trends/explore?geo=${geo}&q=${encodeURIComponent(title)}`,
    };
  });
  return items.filter((i) => i.title);
}
