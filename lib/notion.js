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
  category: '카테고리',
  format: '형식',
  formula: '스토리 공식',
  empathy: '핵심 공감',
  twist: '웃음·반전',
  origin: '구분',
};

// 노션 선택지 (여기 없는 값은 저장하지 않는다)
export const OPTIONS = {
  category: ['회사생활', '개인 프로젝트', '일상'],
  format: ['한컷', '2컷', '3컷', '4컷'],
  formula: ['상황 공감형', '이상과 현실형', '반복형', '생각과 현실형', '허무한 결말형', '시각적 대비'],
  origin: ['재구성 초안', '창작 초안', '실제 경험'],
  status: ['아이디어', '스토리', '콘티', '이미지 제작', '검수', '제작 완료', '업로드 완료'],
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
    category: p[P.category]?.select?.name || '',
    format: p[P.format]?.select?.name || '',
    formula: (p[P.formula]?.multi_select || []).map((o) => o.name),
    empathy: text(p[P.empathy]),
    twist: text(p[P.twist]),
    origin: p[P.origin]?.select?.name || '',
    createdTime: page.created_time,
    views: p[P.views]?.number ?? null,
    reach: p[P.reach]?.number ?? null,
    shares: p[P.shares]?.number ?? null,
    saved: p[P.saved]?.number ?? null,
  };
}

export async function getEpisode(pageId) {
  return toEpisode(await notion(`pages/${pageId}`));
}

/** 에피소드 DB 에 새 행을 만든다 */
export async function createEpisode(properties) {
  const page = await notion('pages', 'POST', {
    parent: { type: 'data_source_id', data_source_id: dataSourceId() },
    properties,
  });
  return toEpisode(page);
}

/** 페이지 본문을 읽기 쉬운 텍스트로 (1단계 블록만) */
export async function getPageText(pageId) {
  const lines = [];
  let cursor;
  do {
    const json = await notion(`blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
    for (const b of json.results) {
      const body = b[b.type];
      const t = (body?.rich_text || []).map((r) => r.plain_text).join('');
      if (b.type.startsWith('heading')) lines.push(`## ${t}`);
      else if (b.type === 'bulleted_list_item' || b.type === 'numbered_list_item') lines.push(`- ${t}`);
      else if (b.type === 'to_do') lines.push(`${body.checked ? '☑' : '☐'} ${t}`);
      else if (b.type === 'divider') lines.push('---');
      else if (t || b.type === 'paragraph') lines.push(t);
    }
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** 텍스트를 노션 블록으로 바꿔 페이지 끝에 추가한다 (기존 본문은 건드리지 않음) */
export async function appendText(pageId, textBody) {
  const chunk = (s) => (s.match(/[\s\S]{1,1900}/g) || ['']).map((c) => ({ text: { content: c } }));
  const blocks = String(textBody).split('\n').map((line) => {
    if (line.startsWith('## ')) return { type: 'heading_3', heading_3: { rich_text: chunk(line.slice(3)) } };
    if (line.startsWith('# ')) return { type: 'heading_2', heading_2: { rich_text: chunk(line.slice(2)) } };
    if (/^[-•] /.test(line)) return { type: 'bulleted_list_item', bulleted_list_item: { rich_text: chunk(line.slice(2)) } };
    if (line.trim() === '---') return { type: 'divider', divider: {} };
    return { type: 'paragraph', paragraph: { rich_text: line ? chunk(line) : [] } };
  });
  for (let i = 0; i < blocks.length; i += 100) {
    await notion(`blocks/${pageId}/children`, 'PATCH', { children: blocks.slice(i, i + 100) });
  }
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
export const multi = (names) => ({ multi_select: (names || []).map((name) => ({ name })) });
export const title = (s) => ({ title: [{ text: { content: String(s || '').slice(0, 1900) } }] });
export const status = (name) => ({ status: { name } });
