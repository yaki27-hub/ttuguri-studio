// 뚜구리 가져오기
//  ① 사이트에서 내보낸 .json 으로 프레임을 만든다 (lib/work/figmaExport.ts, version 1·2)
//  ② 다 만든 프레임을 PNG + 최종 글자로 묶어 사이트로 돌려보낸다 (lib/work/figmaImport.ts)
// 프레임·글자 레이어에는 pluginData 로 편 id·장 id·글자 자리를 기억해 둔다.

figma.showUI(__html__, { width: 360, height: 420 });

const KEY = 'ttuguri';

const ACCENT = { r: 0x79 / 255, g: 0x56 / 255, b: 0xce / 255 };
const INK = { r: 0.12, g: 0.12, b: 0.14 };
const GAP = 80;
const PAD = 88;

/** 한글이 되는 글꼴을 찾아 굵게·보통 두 벌을 불러온다 */
async function pickFonts() {
  const all = await figma.listAvailableFontsAsync();
  const byFamily = {};
  for (const f of all) {
    const fam = f.fontName.family;
    if (!byFamily[fam]) byFamily[fam] = [];
    byFamily[fam].push(f.fontName.style);
  }
  const families = ['Pretendard', 'Pretendard Variable', 'Pretendard JP', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Spoqa Han Sans Neo', 'Inter'];
  const choose = (styles, wants) => wants.find((w) => styles.indexOf(w) >= 0) || styles[0];
  for (const fam of families) {
    const styles = byFamily[fam];
    if (!styles) continue;
    const bold = { family: fam, style: choose(styles, ['Bold', 'ExtraBold', 'SemiBold', 'Black']) };
    const regular = { family: fam, style: choose(styles, ['Regular', 'Medium', 'Light']) };
    await figma.loadFontAsync(bold);
    await figma.loadFontAsync(regular);
    return { bold, regular };
  }
  const fallback = { family: 'Inter', style: 'Regular' };
  await figma.loadFontAsync(fallback);
  return { bold: fallback, regular: fallback };
}

/** 역할별 글자 모양 */
function styleOf(role, kind, fonts) {
  const cover = kind === 'cover';
  switch (role) {
    case 'headline':
      return { font: fonts.bold, size: cover ? 76 : 60, color: INK, line: 130 };
    case 'body':
      return { font: fonts.regular, size: cover ? 40 : 38, color: INK, line: 150 };
    case 'highlight':
      return { font: fonts.bold, size: 36, color: ACCENT, line: 140 };
    case 'tag':
      return { font: fonts.regular, size: 28, color: ACCENT, line: 130 };
    case 'source':
      return { font: fonts.regular, size: 24, color: { r: 0.45, g: 0.45, b: 0.5 }, line: 130 };
    case 'hook':
      return { font: fonts.bold, size: 56, color: INK, line: 130 };
    case 'dialogue':
      return { font: fonts.bold, size: 40, color: INK, line: 140 };
    default:
      return { font: fonts.regular, size: 36, color: INK, line: 150 };
  }
}

function rightEdge() {
  let x = 0;
  for (const n of figma.currentPage.children) {
    if ('x' in n && 'width' in n) x = Math.max(x, n.x + n.width);
  }
  return figma.currentPage.children.length ? x + 200 : 0;
}

async function build(data) {
  if (data.contentType === 'cardnews' && data.design === 'seodang') return buildSeodang(data);
  const fonts = await pickFonts();
  const W = data.width;
  const H = data.height;
  const startX = rightEdge();
  const frames = [];

  data.frames.forEach((f, i) => {
    const frame = figma.createFrame();
    frame.name = f.name;
    frame.resize(W, H);
    frame.x = startX + i * (W + GAP);
    frame.y = 0;
    frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    frame.clipsContent = true;
    frame.setPluginData(KEY, JSON.stringify({ episodeId: data.episodeId || '', panelId: f.panelId || '', title: data.title || '', contentType: data.contentType || '' }));

    if (f.image && f.image.base64) {
      const img = figma.createImage(figma.base64Decode(f.image.base64));
      const rect = figma.createRectangle();
      rect.name = '이미지';
      rect.resize(W, H);
      rect.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
      frame.appendChild(rect);
    }

    let y = f.kind === 'cover' ? 140 : f.kind === 'cut' ? 60 : 110;
    for (const t of f.texts) {
      const s = styleOf(t.role, f.kind, fonts);
      const node = figma.createText();
      node.name = t.name;
      node.fontName = s.font;
      node.fontSize = s.size;
      node.lineHeight = { unit: 'PERCENT', value: s.line };
      node.letterSpacing = { unit: 'PERCENT', value: -2 };
      node.fills = [{ type: 'SOLID', color: s.color }];
      node.characters = t.text;
      if (t.field) node.setPluginData('field', t.field);
      node.x = PAD;
      node.y = y;
      node.resize(W - PAD * 2, node.height);
      node.textAutoResize = 'HEIGHT';
      frame.appendChild(node);
      y += node.height + (t.role === 'headline' ? 28 : 20);
    }
    frames.push(frame);
  });

  return finish(frames, data, W, H, startX, fonts.bold.family);
}

/** 한 편을 섹션으로 묶고 화면을 옮긴다 (섹션이 안 되는 환경이면 프레임만) */
function finish(frames, data, W, H, startX, fontName) {
  let wrap = null;
  try {
    wrap = figma.createSection();
    wrap.name = data.title || '뚜구리';
    wrap.x = startX - 60;
    wrap.y = -120;
    wrap.resizeWithoutConstraints(frames.length * (W + GAP) - GAP + 120, H + 180);
    for (const fr of frames) {
      const ax = fr.x;
      const ay = fr.y;
      wrap.appendChild(fr);
      fr.x = ax - wrap.x;
      fr.y = ay - wrap.y;
    }
  } catch (e) {
    wrap = null;
  }

  figma.currentPage.selection = frames;
  figma.viewport.scrollAndZoomIntoView(wrap ? [wrap] : frames);
  const noImage = data.frames.filter((f) => !f.image).length;
  return `${frames.length}개 프레임을 만들었어요${noImage ? ` (이미지 없는 장 ${noImage}개)` : ''}. 글꼴: ${fontName}`;
}

/* ───────── 카드뉴스 · AI 서당 스타일 (lib/work/cardDesign.ts 와 짝) ───────── */

const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
const SD = {
  bgTop: hex('#10141A'),
  bg: hex('#090B0E'),
  text: hex('#EEF1F4'),
  sub: hex('#A3ADB8'),
  dim: hex('#6B7582'),
  line: hex('#262E38'),
  accent: hex('#5CE1E6'),
};
const SD_LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="44" viewBox="0 0 48 44"><path d="M15 31 L16.5 13 Q23 9.5 29.5 13 L31 31 Z" fill="#5CE1E6"/><rect x="15.5" y="26" width="15" height="3.5" fill="#090B0E" opacity="0.55"/><ellipse cx="23" cy="32" rx="21" ry="5.5" fill="#5CE1E6"/><path d="M16 37 Q17 41 19 43" stroke="#5CE1E6" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M40 2 Q40 9 47 9 Q40 9 40 16 Q40 9 33 9 Q40 9 40 2 Z" fill="#EEF1F4"/></svg>';
const solid = (c, opacity) => ({ type: 'SOLID', color: c, opacity: opacity === undefined ? 1 : opacity });
/** 위 → 아래 그라데이션 */
const vGrad = (c1, a1, c2, a2) => ({
  type: 'GRADIENT_LINEAR',
  gradientTransform: [
    [0, 1, 0],
    [-1, 0, 1],
  ],
  gradientStops: [
    { position: 0, color: { r: c1.r, g: c1.g, b: c1.b, a: a1 } },
    { position: 1, color: { r: c2.r, g: c2.g, b: c2.b, a: a2 } },
  ],
});

/** 제목용 Black Han Sans · 본문용 Noto Sans KR. 없으면 한글 되는 글꼴로 */
async function seodangFonts() {
  const base = await pickFonts();
  const tryLoad = async (f) => {
    try {
      await figma.loadFontAsync(f);
      return f;
    } catch (e) {
      return null;
    }
  };
  return {
    title: (await tryLoad({ family: 'Black Han Sans', style: 'Regular' })) || base.bold,
    body: (await tryLoad({ family: 'Noto Sans KR', style: 'Regular' })) || base.regular,
    medium: (await tryLoad({ family: 'Noto Sans KR', style: 'Medium' })) || base.regular,
    bold: (await tryLoad({ family: 'Noto Sans KR', style: 'Bold' })) || base.bold,
  };
}

function sdText(parent, o) {
  const n = figma.createText();
  n.name = o.name;
  n.fontName = o.font;
  n.fontSize = o.size;
  n.lineHeight = o.line ? { unit: 'PERCENT', value: o.line } : { unit: 'AUTO' };
  if (o.spacing) n.letterSpacing = { unit: 'PIXELS', value: o.spacing };
  n.fills = [solid(o.color)];
  n.characters = o.text;
  if (o.align) n.textAlignHorizontal = o.align;
  if (o.field) n.setPluginData('field', o.field);
  parent.appendChild(n);
  if (o.width) {
    n.resize(o.width, n.height);
    n.textAutoResize = 'HEIGHT';
  } else n.textAutoResize = 'WIDTH_AND_HEIGHT';
  return n;
}

/** 제목 안 강조: 강조 단어가 있으면 그 부분, 없고 두 줄이면 둘째 줄 */
function paintAccent(node, accent) {
  const t = node.characters;
  let a = -1;
  let b = -1;
  const k = accent ? t.indexOf(accent) : -1;
  if (k >= 0) {
    a = k;
    b = k + accent.length;
  } else if (t.indexOf('\n') > 0) {
    a = t.indexOf('\n') + 1;
    b = t.length;
  }
  if (a >= 0 && b > a) node.setRangeFills(a, b, [solid(SD.accent)]);
}

function sdLine(parent, x, y, w) {
  const r = figma.createRectangle();
  r.name = '선';
  r.resize(Math.max(1, w), 2);
  r.x = x;
  r.y = y;
  r.fills = [solid(SD.line)];
  parent.appendChild(r);
  return r;
}

/** 테두리 알약 (태그·연재 이름) */
function sdPill(parent, text, fonts, field) {
  const f = figma.createFrame();
  f.name = '태그';
  f.layoutMode = 'HORIZONTAL';
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'AUTO';
  f.paddingLeft = f.paddingRight = 22;
  f.paddingTop = f.paddingBottom = 8;
  f.cornerRadius = 999;
  f.fills = [];
  f.strokes = [solid(SD.line)];
  f.strokeWeight = 2;
  parent.appendChild(f);
  sdText(f, { name: field ? '태그 글' : '연재', text, font: fonts.medium, size: 30, color: SD.sub, field });
  return f;
}

function sdHeader(frame, brand, i, n, fonts, W) {
  const logo = figma.createNodeFromSvg(SD_LOGO);
  logo.name = '로고';
  logo.resize(60, 55);
  logo.x = 90;
  logo.y = 72;
  frame.appendChild(logo);
  const name = sdText(frame, { name: '계정 이름', text: brand.name || 'AI 서당', font: fonts.title, size: 40, color: SD.text, spacing: 1 });
  const sp = name.characters.indexOf(' ');
  if (sp > 0) name.setRangeFills(0, sp, [solid(SD.accent)]);
  name.x = 90 + 60 + 17;
  name.y = 72 + (55 - name.height) / 2;
  const pg = sdText(frame, { name: '쪽수', text: `${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`, font: fonts.medium, size: 30, color: SD.dim, spacing: 2.5 });
  pg.x = W - 90 - pg.width;
  pg.y = 72 + (55 - pg.height) / 2;
}

function sdFooter(frame, brand, fonts, W, H) {
  const h = sdText(frame, { name: '@계정', text: brand.handle || '', font: fonts.bold, size: 30, color: SD.text });
  const sw = sdText(frame, { name: 'SWIPE', text: 'SWIPE →', font: fonts.bold, size: 30, color: SD.accent, spacing: 3.75 });
  const y = H - 65 - h.height;
  h.x = 90;
  h.y = y;
  sw.x = W - 90 - sw.width;
  sw.y = y;
  return y;
}

async function buildSeodang(data) {
  const fonts = await seodangFonts();
  const W = data.width;
  const H = data.height;
  const IW = W - 180;
  const IH = Math.round(H * 0.603);
  const brand = data.brand || { name: 'AI 서당', handle: '', series: '' };
  const startX = rightEdge();
  const frames = [];
  const n = data.frames.length;

  data.frames.forEach((f, i) => {
    const frame = figma.createFrame();
    frame.name = f.name;
    frame.resize(W, H);
    frame.x = startX + i * (W + GAP);
    frame.y = 0;
    frame.fills = [vGrad(SD.bgTop, 1, SD.bg, 1)];
    frame.clipsContent = true;
    frame.setPluginData(KEY, JSON.stringify({ episodeId: data.episodeId || '', panelId: f.panelId || '', title: data.title || '', contentType: data.contentType || '' }));

    // 위쪽 그림 + 위·아래 어둡게 (글이 길면 아래에서 그림 높이를 줄인다)
    let imgRect = null;
    let fadeRect = null;
    if (f.image && f.image.base64) {
      const img = figma.createImage(figma.base64Decode(f.image.base64));
      const rect = figma.createRectangle();
      rect.name = '이미지';
      rect.resize(W, IH);
      rect.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
      frame.appendChild(rect);
      imgRect = rect;
      const top = figma.createRectangle();
      top.name = '위 어둡게';
      top.resize(W, 225);
      top.fills = [vGrad(SD.bg, 0.75, SD.bg, 0)];
      frame.appendChild(top);
      const bottom = figma.createRectangle();
      bottom.name = '아래 어둡게';
      bottom.resize(W, 300);
      bottom.y = IH - 300;
      bottom.fills = [vGrad(SD.bg, 0, SD.bg, 1)];
      frame.appendChild(bottom);
      fadeRect = bottom;
    }
    /** 글 덩어리 맨 위(textTop)가 그림을 너무 덮으면 그림을 글 위까지만 남긴다 */
    const fitImage = (textTop) => {
      if (!imgRect || textTop >= IH - 120) return;
      const h = Math.max(300, Math.round(textTop + 120));
      imgRect.resize(W, h);
      if (fadeRect) {
        fadeRect.resize(W, Math.min(300, h));
        fadeRect.y = h - fadeRect.height;
      }
    };
    sdHeader(frame, brand, i, n, fonts, W);

    const by = (role) => f.texts.find((t) => t.role === role);
    const head = by('headline');
    const body = by('body');
    const accent = (by('highlight') || {}).text || '';
    const tag = by('tag');
    const src = by('source');
    const long = body && body.text.length > 120;
    /** 꼬리말 바로 위 출처 한 줄. 놓은 뒤 남은 바닥 y 를 돌려준다 */
    const placeSource = (y) => {
      if (!src) return y;
      const t = sdText(frame, { name: '출처', text: `출처 · ${src.text}`, font: fonts.medium, size: 24, color: SD.dim, width: IW, field: src.field });
      t.x = 90;
      t.y = y - t.height;
      return t.y - 24;
    };
    if (f.kind === 'outro') {
      // 마무리: 가운데 제목 + 문구 + 청록 알약
      const btn = figma.createFrame();
      btn.name = '팔로우 버튼';
      btn.layoutMode = 'HORIZONTAL';
      btn.primaryAxisSizingMode = 'AUTO';
      btn.counterAxisSizingMode = 'AUTO';
      btn.paddingLeft = btn.paddingRight = 40;
      btn.paddingTop = btn.paddingBottom = 16;
      btn.cornerRadius = 999;
      btn.fills = [solid(SD.accent)];
      frame.appendChild(btn);
      sdText(btn, { name: '팔로우', text: `${brand.handle || ''} 팔로우`.trim(), font: fonts.bold, size: 32, color: SD.bg });
      btn.x = (W - btn.width) / 2;
      btn.y = H - 90 - btn.height;
      let y = btn.y - 56;
      if (body) {
        const b = sdText(frame, { name: '문구', text: body.text, font: fonts.body, size: long ? 32 : 34, color: SD.sub, line: 155, align: 'CENTER', width: IW, field: body.field });
        b.paragraphSpacing = 18;
        b.x = 90;
        b.y = y - b.height;
        y = b.y - 32;
      }
      if (head) {
        const t = sdText(frame, { name: '제목', text: head.text, font: fonts.title, size: long ? 72 : 92, color: SD.text, line: 118, align: 'CENTER', width: IW, field: head.field });
        paintAccent(t, accent);
        t.x = 90;
        t.y = y - t.height;
        y = t.y;
      }
      if (tag) {
        const pill = sdPill(frame, tag.text, fonts, tag.field);
        pill.x = (W - pill.width) / 2;
        pill.y = y - 30 - pill.height;
        y = pill.y;
      }
      fitImage(y);
    } else if (f.kind === 'cover') {
      // 표지: 선 · 알약 · 선 / 큰 제목(가운데) / 부제 / 꼬리말
      let y = sdFooter(frame, brand, fonts, W, H) - 50;
      if (body) {
        const b = sdText(frame, { name: '부제', text: body.text, font: fonts.body, size: 37, color: SD.sub, line: 140, align: 'CENTER', width: IW, field: body.field });
        b.x = 90;
        b.y = y - b.height;
        y = b.y - 25;
      }
      if (head) {
        const longest = Math.max(...head.text.split('\n').map((l) => l.length));
        const t = sdText(frame, { name: '제목', text: head.text, font: fonts.title, size: longest <= 11 ? 105 : longest <= 15 ? 88 : 74, color: SD.text, line: 115, align: 'CENTER', width: IW, field: head.field });
        paintAccent(t, accent);
        t.x = 90;
        t.y = y - t.height;
        y = t.y - 30;
      }
      const label = tag ? tag.text : brand.series;
      if (label) {
        const pill = sdPill(frame, label, fonts, tag ? tag.field : undefined);
        pill.x = (W - pill.width) / 2;
        pill.y = y - pill.height;
        const ly = pill.y + pill.height / 2 - 1;
        sdLine(frame, 90, ly, pill.x - 25 - 90);
        sdLine(frame, pill.x + pill.width + 25, ly, W - 90 - (pill.x + pill.width + 25));
        y = pill.y;
      }
      fitImage(y);
    } else {
      // 본문: 번호 · 선 · 태그 / 제목 / 본문 / 출처 / 꼬리말
      let y = placeSource(sdFooter(frame, brand, fonts, W, H) - 40) - 10;
      if (body) {
        const b = sdText(frame, { name: '본문', text: body.text, font: fonts.body, size: long ? 33 : 38, color: SD.sub, line: long ? 160 : 155, width: IW, field: body.field });
        b.paragraphSpacing = long ? 22 : 0;
        b.x = 90;
        b.y = y - b.height;
        y = b.y - 22;
      }
      if (head) {
        const t = sdText(frame, { name: '제목', text: head.text, font: fonts.title, size: long ? 64 : 80, color: SD.text, line: 118, width: IW, field: head.field });
        paintAccent(t, accent);
        t.x = 90;
        t.y = y - t.height;
        y = t.y - 35;
      }
      const no = sdText(frame, { name: '번호', text: String(i).padStart(2, '0'), font: fonts.title, size: 55, color: SD.accent, line: 100 });
      no.x = 90;
      no.y = y - no.height;
      const cy = no.y + no.height / 2 - 1;
      let right = W - 90;
      if (tag) {
        const pill = sdPill(frame, tag.text, fonts, tag.field);
        pill.x = W - 90 - pill.width;
        pill.y = cy + 1 - pill.height / 2;
        right = pill.x - 25;
      }
      sdLine(frame, no.x + no.width + 25, cy, right - (no.x + no.width + 25));
      fitImage(no.y);
    }
    frames.push(frame);
  });

  return finish(frames, data, W, H, startX, `${fonts.title.family} · ${fonts.body.family}`);
}
/* ───────── ② 완성본을 사이트로 ───────── */

function metaOf(node) {
  try {
    const raw = node.getPluginData(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/** 선택한 것(섹션·그룹이면 그 안까지) 중 이 플러그인이 만든 프레임. 아무것도 안 골랐으면 현재 페이지 전체 */
function targetFrames() {
  const out = [];
  const seen = {};
  const take = (n) => {
    if (n.type === 'FRAME' && metaOf(n) && !seen[n.id]) {
      seen[n.id] = true;
      out.push(n);
      return;
    }
    if ('findAll' in n) {
      for (const c of n.findAll((x) => x.type === 'FRAME' && !!metaOf(x))) {
        if (!seen[c.id]) {
          seen[c.id] = true;
          out.push(c);
        }
      }
    }
  };
  const sel = figma.currentPage.selection;
  if (sel.length) sel.forEach(take);
  else take(figma.currentPage);
  return out;
}

async function sendFinal() {
  const frames = targetFrames();
  if (!frames.length) throw new Error('이 플러그인으로 만든 프레임을 찾지 못했어요. 보낼 프레임(또는 섹션)을 선택해 주세요.');
  const eps = {};
  for (const f of frames) eps[metaOf(f).episodeId || '?'] = true;
  if (Object.keys(eps).length > 1) throw new Error('여러 편의 프레임이 섞여 있어요. 한 편의 프레임(또는 그 섹션)만 선택해 주세요.');
  // 사이트에서는 장 id로 맞추므로 순서는 참고용 (왼쪽 → 오른쪽)
  frames.sort((a, b) => a.absoluteTransform[0][2] - b.absoluteTransform[0][2]);
  const first = metaOf(frames[0]);
  const out = [];
  for (const [k, f] of frames.entries()) {
    figma.ui.postMessage({ type: 'progress', text: `PNG로 내보내는 중… ${k + 1}/${frames.length}` });
    const bytes = await f.exportAsync({ format: 'PNG', constraint: { type: 'WIDTH', value: 1080 } });
    const texts = f
      .findAll((n) => n.type === 'TEXT' && n.visible && !!n.getPluginData('field'))
      .map((n) => ({ field: n.getPluginData('field'), text: n.characters }));
    out.push({ panelId: metaOf(f).panelId, name: f.name, image: { mime: 'image/png', base64: figma.base64Encode(bytes) }, texts });
  }
  return { app: 'ttuguri-studio', kind: 'final', version: 2, episodeId: first.episodeId, title: first.title, contentType: first.contentType, exportedAt: new Date().toISOString(), frames: out };
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'import') {
    try {
      const text = await build(msg.data);
      figma.notify(text);
      figma.ui.postMessage({ type: 'done', text });
    } catch (e) {
      figma.ui.postMessage({ type: 'error', text: `만들지 못했어요: ${e.message || e}` });
    }
  }
  if (msg.type === 'send') {
    try {
      const data = await sendFinal();
      figma.ui.postMessage({ type: 'final', data });
    } catch (e) {
      figma.ui.postMessage({ type: 'error', text: e.message || String(e) });
    }
  }
};
