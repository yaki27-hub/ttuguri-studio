// Notion API (데이터 소스 기반, 2025-09-03 버전)
const NOTION_VERSION = '2025-09-03';

// 🎬 에피소드 DB 의 열 이름. 노션에서 열 이름을 바꾸면 여기도 같이 바꿔야 한다.
export const P = {
  title: '제목',
  number: '번호',
  status: '제작 상태',
  link: '인스타그램 링크',
  mediaId: 'Instagram Media ID',
  uploaded: '실제 업로드일',
  views: '조회수',
  reach: '도달 수',
  likes: '좋아요',
  comments: '댓글 수',
  shares: '공유',
  saved: '저장',
  syncedAt: '최근 동기화',
  syncState: '동기화 상태',
};

function dataSourceId() {
  const id = process.env.NOTION_DATA_SOURCE_ID;
  if (!id) throw new Error('NOTION_DATA_SOURCE_ID 환경변수가 설정되지 않았습니다.');
  return id;
}

async function notion(path, method = 'GET', body) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN 환경변수가 설정되지 않았습니다.');
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Notion API 오류: ${json.message || res.status}`);
  }
  return json;
}

const text = (prop) => (prop?.rich_text || prop?.title || []).map((t) => t.plain_text).join('');

function toEpisode(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    url: page.url,
    title: text(p[P.title]) || '(제목 없음)',
    number: p[P.number]?.number ?? null,
    status: p[P.status]?.status?.name || p[P.status]?.select?.name || '',
    link: p[P.link]?.url || '',
    mediaId: text(p[P.mediaId]).trim(),
    uploaded: p[P.uploaded]?.date?.start || null,
  };
}

/** 에피소드 DB 전체 행 */
export async function listEpisodes() {
  const episodes = [];
  let cursor;
  do {
    const json = await notion(`data_sources/${dataSourceId()}/query`, 'POST', {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    episodes.push(...json.results.map(toEpisode));
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return episodes;
}

export async function updatePage(pageId, properties) {
  return notion(`pages/${pageId}`, 'PATCH', { properties });
}

// --- 속성 값 생성 도우미 ---
export const num = (v) => ({ number: typeof v === 'number' ? v : null });
export const rich = (s) => ({ rich_text: s ? [{ text: { content: String(s) } }] : [] });
export const url = (s) => ({ url: s || null });
export const date = (iso) => ({ date: iso ? { start: iso } : null });
export const select = (name) => ({ select: name ? { name } : null });
