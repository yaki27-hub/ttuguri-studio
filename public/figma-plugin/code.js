// 뚜구리 가져오기
//  ① 사이트에서 내보낸 .json 으로 프레임을 만든다 (lib/work/figmaExport.ts, version 1·2)
//  v3: 카드뉴스 '내 피그마 마스터' (ai_title · page 컴포넌트 복제)
//  v4: 카드뉴스 기본 템플릿 '어쩌다 발견' (buildEojjeoda)
//  v5: 인스타툰 릴스 9:16 레이아웃 (buildReels) · 가이드 레이어는 완성본 PNG에서 뺀다
//  v6: 인스타툰 마감(그림 설정 6번) — 워터마크 왼쪽 위, 컷 번호·시리즈 배지 오른쪽 위, 굵은 고딕 갈색 제목, 손글씨 대사 말풍선
//  v7: 피드 제목·워터마크 배치를 완성본(11.28)에서 잰 값으로 · 완성본을 보낼 때 고친 글꼴·자리를 읽어 다음 내보내기에 씀 · 제목 [단어] 강조색
//  ② 다 만든 프레임을 PNG + 최종 글자로 묶어 사이트로 돌려보낸다 (lib/work/figmaImport.ts)
// 프레임·글자 레이어에는 pluginData 로 편 id·장 id·글자 자리를 기억해 둔다.

figma.showUI(__html__, { width: 360, height: 420 });

const KEY = 'ttuguri';
/** 플러그인 버전 — lib/work/figmaExport.ts FIGMA_PLUGIN_VERSION · ui.html 제목 · manifest.json name 과 같이 올릴 것 */
const PLUGIN_VERSION = 7;

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
  if (data.plugin && data.plugin > PLUGIN_VERSION)
    throw new Error(`이 파일은 플러그인 v${data.plugin}용인데 지금 플러그인은 v${PLUGIN_VERSION}이에요. 사이트 이미지 단계 → 피그마로 보내기 → ‘플러그인 받기’로 새로 받아 폴더에 덮어써 주세요.`);
  if (data.layout === 'reels') return buildReels(data);
  if (data.contentType === 'instatoon' && data.style) return buildToonFeed(data);
  if (data.contentType === 'cardnews' && data.design === 'eojjeoda') return buildEojjeoda(data);
  if (data.contentType === 'cardnews' && data.design === 'master') {
    const r = await buildMaster(data);
    if (r) return r;
  }
  if (data.contentType === 'cardnews' && (data.design === 'seodang' || data.design === 'master')) return buildSeodang(data);
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
function finish(frames, data, W, H, startX, fontName, coverOnly) {
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
  const noImage = (coverOnly ? data.frames.slice(0, 1) : data.frames).filter((f) => !f.image).length;
  return `${frames.length}개 프레임을 만들었어요${noImage ? (coverOnly ? ' (표지 그림 없음)' : ` (이미지 없는 장 ${noImage}개)`) : ''}. 글꼴: ${fontName}`;
}

/* ───────── 인스타툰 마감 (그림 설정 6번, lib/work/artGuide.ts figmaStyle 와 짝) ───────── */

const HAND_FAMILIES = ['Ownglyph 2022 UWY Yoon Yeong', 'Gaegu', 'Nanum Pen Script', 'NanumPen', '나눔손글씨 펜', 'KyoboHandwriting2019', 'KyoboHandwriting2020', 'Gaegu', 'Gamja Flower', 'Hi Melody', 'Poor Story', 'Single Day', 'Yeon Sung', 'Nanum Brush Script', 'East Sea Dokdo', 'Cafe24 Ssurround'];
/** 뚜구리툰 글꼴 (11.28): 제목 KCC-Ganpan · 워터마크·컷 번호 LeeSeoyun · 대사 Ownglyph 2022 UWY Yoon Yeong(없으면 Gaegu).
 *  완성본에서 읽은 글꼴이 있으면 그게 우선 */
const TITLE_FAMILIES = ['KCC-Ganpan', 'Jua', 'BM JUA_OTF', 'BM JUA_TTF', 'Cafe24 Ssurround', 'Cafe24 Ssurround OTF', 'Pretendard', 'Pretendard Variable', 'Pretendard JP', 'Noto Sans KR', 'Spoqa Han Sans Neo', 'Apple SD Gothic Neo'];

/** 피드 4:5 제목·워터마크 기본 배치 — 2026-11-28 완성본(1080×1350, 천장 히터 편)에서 잰 값.
 *  완성본을 사이트로 보낼 때 프레임에서 읽은 배치(learnLayout)를 기억해 두고, 있으면 그걸 쓴다. */
const TOON_LAYOUT = {
  mark: { font: null, size: 44, color: '#6B5E4F', opacity: 1, x: 80, y: 60, right: 1014 },
  title: { font: null, size: 150, color: '#1F1A14', stroke: '#C7C7C7', strokeWeight: 6, strokeAlign: 'OUTSIDE', highlight: '#FF383C', line: 128, track: -2, align: 'CENTER', x: 88, y: 150, w: 904 },
};
const MARK_FAMILIES = ['LeeSeoyun', 'Gaegu'].concat(TITLE_FAMILIES);
const LAYOUT_KEY = 'toonLayout';

/** 이 컴퓨터에 기억한 배치 → 사이트 설정에 저장된 배치 → 기본값 */
async function layoutOf(st) {
  let saved = null;
  try {
    saved = await figma.clientStorage.getAsync(LAYOUT_KEY);
  } catch (e) {}
  const src = saved || (st && st.layout) || null;
  return { mark: Object.assign({}, TOON_LAYOUT.mark, src && src.mark), title: Object.assign({}, TOON_LAYOUT.title, src && src.title), learned: !!src };
}

/** 제목 + 워터마크 글꼴 + 대사용 손글씨 (없으면 보통 글꼴로) */
async function toonFonts(base, L) {
  const all = await figma.listAvailableFontsAsync();
  const by = {};
  for (const f of all) (by[f.fontName.family] = by[f.fontName.family] || []).push(f.fontName.style);
  const pick = async (fams, wants) => {
    for (const fam of fams) {
      const st = by[fam];
      if (!st) continue;
      const style = wants.find((w) => st.indexOf(w) >= 0) || st[0];
      try {
        await figma.loadFontAsync({ family: fam, style });
        return { family: fam, style };
      } catch (e) {}
    }
    return null;
  };
  const exact = async (f) => {
    if (!f || !f.family) return null;
    try {
      await figma.loadFontAsync(f);
      return { family: f.family, style: f.style };
    } catch (e) {
      return null;
    }
  };
  const heavy = (await exact(L && L.title.font)) || (await pick(TITLE_FAMILIES, ['ExtraBold', 'Black', 'Bold', 'SemiBold'])) || base.bold;
  const mark = (await exact(L && L.mark.font)) || (await pick(MARK_FAMILIES, ['Bold', 'SemiBold', 'ExtraBold', 'Regular'])) || base.bold;
  const hand = await pick(HAND_FAMILIES, ['Regular', 'Medium', 'Bold']);
  return { heavy, mark, hand: hand || base.regular, handFound: !!hand };
}

function plainText(parent, o) {
  const n = figma.createText();
  n.name = o.name;
  n.fontName = o.font;
  n.fontSize = o.size;
  n.lineHeight = { unit: 'PERCENT', value: o.line || 130 };
  n.letterSpacing = { unit: 'PERCENT', value: o.track === undefined ? -2 : o.track };
  n.fills = [{ type: 'SOLID', color: o.color, opacity: o.opacity === undefined ? 1 : o.opacity }];
  n.characters = o.text;
  if (o.align) n.textAlignHorizontal = o.align;
  parent.appendChild(n);
  return n;
}

/** "[히터]랑 싸워야" → 글자 "히터랑 싸워야" + 강조 구간 [[0, 2]] */
function markup(s) {
  const ranges = [];
  let out = '';
  let last = 0;
  String(s || '').replace(/\[([^\[\]\n]+)\]/g, (m, w, i) => {
    out += s.slice(last, i);
    ranges.push([out.length, out.length + w.length]);
    out += w;
    last = i + m.length;
    return m;
  });
  return { text: out + String(s || '').slice(last), ranges };
}

/** 왼쪽 위 워터마크, 오른쪽 위 [시리즈 배지][컷 번호] — o.L(배치)의 글꼴·크기·색·자리 */
function toonMarks(frame, data, st, fonts, tf, o) {
  const L = o.L;
  const color = rgbOf(L.color, INK);
  const y = o.y === undefined ? L.y : o.y;
  const mark = (name, text) => plainText(frame, { name, text, font: tf.mark, size: L.size, color, opacity: L.opacity, track: 0, line: 120 });
  if (st.watermark) {
    const w = mark('워터마크', st.watermark);
    w.x = L.x;
    w.y = y;
  }
  let right = L.right;
  if (st.cutNumbers && o.number) {
    const n = mark('컷 번호', o.number);
    n.x = right - n.width;
    n.y = y;
    right = n.x - 16;
  }
  if (data.badge) {
    const pill = figma.createFrame();
    pill.name = '시리즈 배지';
    pill.layoutMode = 'HORIZONTAL';
    pill.primaryAxisSizingMode = 'AUTO';
    pill.counterAxisSizingMode = 'AUTO';
    pill.paddingLeft = pill.paddingRight = 18;
    pill.paddingTop = pill.paddingBottom = 6;
    pill.cornerRadius = 999;
    pill.fills = [{ type: 'SOLID', color }];
    const t = plainText(pill, { name: '배지 글자', text: data.badge, font: tf.mark, size: Math.round(L.size * 0.6), color: WHITE, track: 0 });
    t.textAutoResize = 'WIDTH_AND_HEIGHT';
    frame.appendChild(pill);
    pill.x = right - pill.width;
    pill.y = y + Math.max(0, Math.round((L.size * 1.2 - pill.height) / 2));
  }
}

/** 제목·첫 화면 문구: o.look(배치)의 글꼴·색·테두리, [단어]는 강조색 (어두운 바탕이면 흰색) */
function toonTitle(frame, t, st, tf, o) {
  const look = o.look;
  const m = markup(t.text);
  const n = plainText(frame, { name: t.name, text: m.text, font: st.titleFont ? tf.heavy : o.fonts.bold, size: o.size, color: o.dark ? WHITE : rgbOf(look.color, INK), line: look.line, track: look.track, align: o.align || look.align || 'LEFT' });
  if (look.stroke && look.strokeWeight > 0) {
    n.strokes = [{ type: 'SOLID', color: rgbOf(look.stroke, WHITE) }];
    n.strokeWeight = look.strokeWeight;
    n.strokeAlign = look.strokeAlign || 'OUTSIDE';
  }
  const hl = rgbOf(look.highlight, null);
  if (hl) for (const [a, b] of m.ranges) n.setRangeFills(a, b, [{ type: 'SOLID', color: hl }]);
  if (t.field) n.setPluginData('field', t.field);
  n.x = o.x;
  n.resize(o.w, n.height);
  n.textAutoResize = 'HEIGHT';
  if (o.room) while (n.height > o.room && n.fontSize > 40) n.fontSize = n.fontSize - 4;
  n.y = o.y;
  return n;
}

/** 대사: 손글씨 + 흰 말풍선 / 자막·내레이션: 반투명 흰 상자. 돌려주는 값 { node, lines } */
function toonLine(frame, t, st, fonts, tf, o) {
  const isDialogue = t.role === 'dialogue';
  const text = plainText(frame, {
    name: t.name,
    text: t.text,
    font: isDialogue && st.bubbles ? tf.hand : fonts.regular,
    size: isDialogue && st.bubbles && tf.handFound ? 46 : isDialogue ? 40 : 36,
    color: INK,
    line: isDialogue ? 135 : 150,
  });
  if (t.field) text.setPluginData('field', t.field);
  const padX = isDialogue ? 34 : 28;
  const padY = isDialogue ? 22 : 18;
  text.textAutoResize = 'WIDTH_AND_HEIGHT';
  if (text.width > o.w - padX * 2) {
    text.resize(o.w - padX * 2, text.height);
    text.textAutoResize = 'HEIGHT';
  }
  const lines = Math.round(text.height / (text.fontSize * (isDialogue ? 1.35 : 1.5)));
  if (!st.bubbles) {
    text.x = o.x;
    text.y = o.y;
    return { node: text, lines };
  }
  const box = figma.createFrame();
  box.name = isDialogue ? `말풍선 · ${t.name}` : `자막 상자 · ${t.name}`;
  box.layoutMode = 'VERTICAL';
  box.primaryAxisSizingMode = 'AUTO';
  box.counterAxisSizingMode = 'AUTO';
  box.paddingLeft = box.paddingRight = padX;
  box.paddingTop = box.paddingBottom = padY;
  box.cornerRadius = isDialogue ? 40 : 18;
  box.fills = [{ type: 'SOLID', color: WHITE, opacity: isDialogue ? 1 : 0.82 }];
  if (isDialogue) {
    box.strokes = [{ type: 'SOLID', color: INK }];
    box.strokeWeight = 3;
  }
  frame.appendChild(box);
  box.appendChild(text);
  box.x = o.x;
  box.y = o.y;
  return { node: box, lines };
}

/** 피드 4:5 인스타툰 (data.style 이 있을 때) */
async function buildToonFeed(data) {
  const fonts = await pickFonts();
  const st = data.style;
  const L = await layoutOf(st);
  const tf = await toonFonts(fonts, L);
  const W = data.width;
  const H = data.height;
  const startX = rightEdge();
  const frames = [];
  const n = data.frames.length;
  let long = 0;

  data.frames.forEach((f, i) => {
    const frame = figma.createFrame();
    frame.name = f.name;
    frame.resize(W, H);
    frame.x = startX + i * (W + GAP);
    frame.y = 0;
    frame.fills = [{ type: 'SOLID', color: WHITE }];
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
    toonMarks(frame, data, st, fonts, tf, { W, L: L.mark, number: n > 1 ? `${i + 1}/${n}` : '' });
    // 제목·말풍선은 그리드 3:4 잘림을 피해 좌우 끝에서 60px 넘게 안쪽 (PAD 88)
    let y = L.title.y;
    for (const t of f.texts) {
      if (t.role === 'hook') {
        const node = toonTitle(frame, t, st, tf, { fonts, look: L.title, size: L.title.size, x: L.title.x, y, w: L.title.w, room: Math.round(L.title.size * (L.title.line / 100) * 2.6) });
        y += node.height + 28;
        continue;
      }
      const r = toonLine(frame, t, st, fonts, tf, { x: PAD, y, w: W - PAD * 2 });
      if (st.maxLines && r.lines > st.maxLines) long += 1;
      y += r.node.height + 18;
    }
    frames.push(frame);
  });

  const r = finish(frames, data, W, H, startX, `${tf.heavy.family}${st.bubbles ? ` · 대사 ${tf.hand.family}` : ''}`);
  return [r, L.learned ? '제목·워터마크는 기억해 둔 배치로' : '', st.bubbles && !tf.handFound ? '손글씨 글꼴(나눔손글씨 펜 등)이 없어 대사는 보통 글꼴로 넣었어요' : '', long ? `대사가 ${st.maxLines}줄을 넘는 곳 ${long}개` : ''].filter(Boolean).join(' · ');
}

/* ───────── 인스타툰 릴스 9:16 (lib/work/figmaExport.ts REELS 와 짝) ───────── */

const RL = { W: 1080, H: 1920, IMG_Y: 280, UI_BOTTOM: 0.2, UI_RIGHT: 170, GRID_TOP: 240, GRID_H: 1440 };
const rgbOf = (h, fb) => (/^#[0-9a-f]{6}$/i.test(h || '') ? { r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 } : fb);
const isLight = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.55;
const WHITE = { r: 1, g: 1, b: 1 };

/** 완성본으로 보낼 때 숨기는 안내 레이어 */
function guideRect(frame, name, x, y, w, h, opts) {
  const r = figma.createRectangle();
  r.name = `가이드 · ${name}`;
  r.x = x;
  r.y = y;
  r.resize(w, h);
  r.fills = opts.fill ? [{ type: 'SOLID', color: { r: 0.93, g: 0.2, b: 0.2 }, opacity: 0.16 }] : [];
  r.strokes = [{ type: 'SOLID', color: { r: 0.93, g: 0.2, b: 0.2 } }];
  r.strokeWeight = 3;
  r.dashPattern = [16, 10];
  r.locked = true;
  r.setPluginData('guide', '1');
  frame.appendChild(r);
  return r;
}

async function buildReels(data) {
  const fonts = await pickFonts();
  const st = data.style || null;
  const L = st ? await layoutOf(st) : null;
  const tf = st ? await toonFonts(fonts, L) : null;
  const cuts = data.frames.filter((f) => f.kind !== 'reelsCover').length;
  let long = 0;
  const { W, H, IMG_Y } = RL;
  const IMG_H = data.cutHeight || 1350;
  const UI_Y = Math.round(H * (1 - RL.UI_BOTTOM));
  const startX = rightEdge();
  const frames = [];
  let crowded = 0;

  data.frames.forEach((f, i) => {
    const cover = f.kind === 'reelsCover';
    const top = rgbOf(f.edge && f.edge.top, WHITE);
    const bottom = rgbOf(f.edge && f.edge.bottom, WHITE);
    const frame = figma.createFrame();
    frame.name = f.name;
    frame.resize(W, H);
    frame.x = startX + i * (W + GAP);
    frame.y = 0;
    frame.fills = [{ type: 'SOLID', color: bottom }];
    frame.clipsContent = true;
    frame.setPluginData(KEY, JSON.stringify({ episodeId: data.episodeId || '', panelId: f.panelId || '', title: data.title || '', contentType: data.contentType || '' }));

    // 위 여백: 그림 맨 위 색으로 이어 칠한다 (제목 자리)
    const band = figma.createRectangle();
    band.name = '위 여백';
    band.resize(W, IMG_Y + 2);
    band.fills = [{ type: 'SOLID', color: top }];
    frame.appendChild(band);

    if (f.image && f.image.base64) {
      const img = figma.createImage(figma.base64Decode(f.image.base64));
      const rect = figma.createRectangle();
      rect.name = '컷 그림';
      rect.y = IMG_Y;
      rect.resize(W, IMG_H);
      rect.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
      frame.appendChild(rect);
    }

    if (st) toonMarks(frame, data, st, fonts, tf, { W, L: L.mark, y: IMG_Y + 26, number: !cover && cuts > 1 ? `${data.frames.slice(0, i + 1).filter((x) => x.kind !== 'reelsCover').length}/${cuts}` : '' });
    let y = IMG_Y + (st ? 96 : 48);
    for (const t of f.texts) {
      if (st && t.role === 'reelsTitle') {
        const node = toonTitle(frame, t, st, tf, { fonts, look: L.title, size: cover ? 88 : 68, x: PAD, y: 0, w: W - PAD * 2, align: 'CENTER', dark: !cover && !isLight(top), room: cover ? 300 : IMG_Y - 120 });
        // 커버는 워터마크 줄(그림 위 26px) 아래, 그리드 3:4 안
        node.y = cover ? RL.GRID_TOP + 140 : Math.max(96, Math.round((IMG_Y - node.height) / 2 + 30));
        continue;
      }
      if (st) {
        const r = toonLine(frame, t, st, fonts, tf, { x: PAD, y, w: W - PAD - RL.UI_RIGHT });
        if (st.maxLines && r.lines > st.maxLines) long += 1;
        y += r.node.height + 18;
        continue;
      }
      const node = figma.createText();
      node.name = t.name;
      if (t.field) node.setPluginData('field', t.field);
      if (t.role === 'reelsTitle') {
        node.fontName = fonts.bold;
        node.fontSize = cover ? 88 : 68;
        node.lineHeight = { unit: 'PERCENT', value: 125 };
        node.letterSpacing = { unit: 'PERCENT', value: -2 };
        node.textAlignHorizontal = 'CENTER';
        // 커버는 그리드 3:4 안 위쪽(그림 위쪽 25% 빈 자리)에, 컷은 위 여백 안에
        node.fills = [{ type: 'SOLID', color: cover ? INK : isLight(top) ? INK : WHITE }];
        node.characters = markup(t.text).text;
        node.x = PAD;
        node.resize(W - PAD * 2, node.height);
        node.textAutoResize = 'HEIGHT';
        const room = cover ? 300 : IMG_Y - 120;
        while (node.height > room && node.fontSize > 40) node.fontSize = node.fontSize - 4;
        node.y = cover ? RL.GRID_TOP + 90 : Math.max(96, Math.round((IMG_Y - node.height) / 2 + 30));
        frame.appendChild(node);
        continue;
      }
      const s = styleOf(t.role, 'cut', fonts);
      node.fontName = s.font;
      node.fontSize = s.size;
      node.lineHeight = { unit: 'PERCENT', value: s.line };
      node.letterSpacing = { unit: 'PERCENT', value: -2 };
      node.fills = [{ type: 'SOLID', color: s.color }];
      node.characters = t.text;
      // 오른쪽 끝(좋아요·댓글 버튼)을 피해 폭을 줄인다
      node.x = PAD;
      node.y = y;
      node.resize(W - PAD - RL.UI_RIGHT, node.height);
      node.textAutoResize = 'HEIGHT';
      frame.appendChild(node);
      y += node.height + 20;
    }
    if (y > UI_Y) crowded += 1;

    // 안내: 인스타 UI 자리 (대사 금지), 커버는 그리드 3:4 잘림선
    guideRect(frame, '아래 20% 캡션·UI — 대사 금지', 0, UI_Y, W, H - UI_Y, { fill: true });
    guideRect(frame, '오른쪽 버튼 — 대사 금지', W - RL.UI_RIGHT, Math.round(H * 0.45), RL.UI_RIGHT, UI_Y - Math.round(H * 0.45), { fill: true });
    if (cover) guideRect(frame, '그리드 3:4로 보이는 영역', 0, RL.GRID_TOP, W, RL.GRID_H, { fill: false });
    frames.push(frame);
  });

  const r = finish(frames, data, W, H, startX, tf ? `${tf.heavy.family}${st.bubbles ? ` · 대사 ${tf.hand.family}` : ''}` : fonts.bold.family);
  return [
    r,
    crowded ? `글이 UI 자리(아래 20%)까지 내려간 프레임 ${crowded}개는 대사를 줄여 주세요` : '',
    st && st.bubbles && !tf.handFound ? '손글씨 글꼴(나눔손글씨 펜 등)이 없어 대사는 보통 글꼴로 넣었어요' : '',
    long ? `대사가 ${st.maxLines}줄을 넘는 곳 ${long}개` : '',
  ].filter(Boolean).join(' · ');
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
      t.setPluginData('prefix', '출처 · ');
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

/* ───────── 카드뉴스 · 내 피그마 마스터 (이 파일의 ai_title · page 컴포넌트) ─────────
 * 그림 있는 장 = 전체 이미지 + ai_title(invert 우선) 인스턴스를 아래에
 * 그림 없는 본문 장 = page(type=Default) 인스턴스
 * 마무리 = page(type=end) 인스턴스 (이미지 칸이 있으면 그림을 채운다)
 * 인스턴스 안 글자는 레이어 이름(브랜드·제목·본문)으로 찾아 채우고, 나머지는 마스터 그대로 둔다.
 */
async function findMaster() {
  await figma.loadAllPagesAsync();
  const sets = figma.root.findAllWithCriteria({ types: ['COMPONENT_SET'] });
  const pick = (setName, variants) => {
    const set = sets.find((x) => x.name.trim() === setName);
    if (!set) return null;
    for (const v of variants) {
      const c = set.children.find((k) => k.type === 'COMPONENT' && k.name.replace(/\s/g, '') === v);
      if (c) return c;
    }
    return set.defaultVariant || set.children[0] || null;
  };
  return {
    title: pick('ai_title', ['type=invert', 'type=Default']),
    page: pick('page', ['type=Default']),
    end: pick('page', ['type=end', 'type=Default']),
  };
}

async function loadFontsOf(node) {
  if (node.type !== 'TEXT' || !node.characters.length) {
    if (node.type === 'TEXT') await figma.loadFontAsync(node.fontName === figma.mixed ? { family: 'Inter', style: 'Regular' } : node.fontName);
    return;
  }
  for (const f of node.getRangeAllFontNames(0, node.characters.length)) await figma.loadFontAsync(f);
}

/** 인스턴스 안 글자 바꾸기 (첫 글자 스타일을 그대로 쓴다) */
async function setText(node, text) {
  await loadFontsOf(node);
  node.characters = text;
}

const textsIn = (inst, name) => inst.findAll((n) => n.type === 'TEXT' && n.name.trim() === name);

function paintRange(node, accent, color) {
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
  if (a >= 0 && b > a && color) node.setRangeFills(a, b, [{ type: 'SOLID', color }]);
}

/** 브랜드 알약 배경색을 강조색으로 쓴다 */
function accentOf(inst) {
  const brand = textsIn(inst, '브랜드')[0];
  const pill = brand && brand.parent;
  const fill = pill && Array.isArray(pill.fills) && pill.fills.find((f) => f.type === 'SOLID' && f.visible !== false);
  return fill ? fill.color : hex('#5CE1E6');
}

/** 글자를 채우기 전 위치·높이를 기억해 둔다 (겹침 정리용) */
function snapshot(root) {
  const m = new Map();
  for (const n of root.findAll((x) => x.type === 'TEXT')) m.set(n.name + '|' + Math.round(n.y) + '|' + Math.round(n.x), { y: n.y, h: n.height });
  return m;
}

/**
 * 길어진 글이 아래 칸을 덮으면 아래 칸을 밀어 내린다 (같은 부모 안에서, 원래 간격을 최대 24px 로 유지).
 * 오토 레이아웃이면 피그마가 알아서 하므로 건너뛴다. 인스턴스 안 위치를 못 바꾸면 false.
 */
function restack(root, before) {
  const groups = new Map();
  for (const n of root.findAll((x) => x.type === 'TEXT' && x.visible)) {
    const p = n.parent;
    if (p && 'layoutMode' in p && p.layoutMode && p.layoutMode !== 'NONE') continue;
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(n);
  }
  try {
    for (const list of groups.values()) {
      const items = list
        .map((n) => ({ n, o: before.get(n.name + '|' + Math.round(n.y) + '|' + Math.round(n.x)) || { y: n.y, h: n.height } }))
        .sort((a, b) => a.o.y - b.o.y);
      let prevBottom = -Infinity;
      let prevOrigBottom = -Infinity;
      for (const it of items) {
        const gap = Math.min(24, Math.max(8, it.o.y - prevOrigBottom));
        const y = Math.max(it.o.y, prevBottom + gap);
        if (Math.abs(y - it.n.y) > 0.5) it.n.y = y;
        prevBottom = it.n.y + it.n.height;
        prevOrigBottom = it.o.y + it.o.h;
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

function imageFill(node, base64) {
  const img = figma.createImage(figma.base64Decode(base64));
  node.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
}

async function buildMaster(data) {
  const m = await findMaster();
  if (!m.title || !m.page) {
    figma.notify('이 파일에서 ai_title · page 컴포넌트를 찾지 못해 기본 AI 서당 배치로 만들어요.');
    return null;
  }
  const W = data.width;
  const H = data.height;
  const startX = rightEdge();
  const brand = data.brand || {};
  const frames = [];
  let detached = 0;

  for (const [i, f] of data.frames.entries()) {
    const by = (role) => f.texts.find((t) => t.role === role);
    const head = by('headline');
    const body = by('body');
    const accent = (by('highlight') || {}).text || '';
    const tag = by('tag');
    const src = by('source');
    const hasImg = !!(f.image && f.image.base64);
    const fields = {};

    const frame = figma.createFrame();
    frame.name = f.name;
    frame.resize(W, H);
    frame.x = startX + i * (W + GAP);
    frame.y = 0;
    frame.fills = [{ type: 'SOLID', color: hex('#090B0E') }];
    frame.clipsContent = true;

    let inst;
    const isTitle = !(f.kind === 'outro' || (!hasImg && f.kind !== 'cover'));
    if (!isTitle) {
      inst = (f.kind === 'outro' ? m.end : m.page).createInstance();
      frame.appendChild(inst);
      inst.x = 0;
      inst.y = 0;
      const pic = inst.findOne((n) => n.name.trim() === '이미지' && 'fills' in n);
      if (pic) {
        if (hasImg) {
          imageFill(pic, f.image.base64);
          pic.visible = true;
        } else pic.visible = false;
      }
    } else {
      if (hasImg) {
        const rect = figma.createRectangle();
        rect.name = '이미지';
        rect.resize(W, H);
        imageFill(rect, f.image.base64);
        frame.appendChild(rect);
      }
      inst = m.title.createInstance();
      frame.appendChild(inst);
      inst.x = 0;
    }

    const color = accentOf(inst);
    let root = inst;
    const before = snapshot(root);
    for (const b of textsIn(root, '브랜드')) await setText(b, brand.series || b.characters);
    const t = textsIn(root, '제목')[0];
    if (t && head) {
      await setText(t, head.text);
      paintRange(t, accent, color);
    }
    // 본문 칸이 여럿이면: 가장 큰 칸 = 본문, 가장 아래 작은 칸 = 태그(#섹션) 또는 출처
    const bigFirst = (r) => textsIn(r, '본문').sort((a, b) => b.width * b.height - a.width * a.height)
    const bodies = bigFirst(root);
    if (bodies[0] && body) await setText(bodies[0], body.text);
    const small = bodies.slice(1).sort((a, b) => b.y - a.y)[0];
    if (small && f.kind !== 'outro') {
      const line = tag ? `#${tag.text.replace(/^#/, '')}` : src ? `출처 · ${src.text}` : '';
      if (line) await setText(small, line);
      else small.visible = false;
    }

    // 길어진 글이 아래 칸을 덮으면 밀어 내린다. 인스턴스 안에서 못 옮기면 이 장만 인스턴스를 풀어서 옮긴다.
    if (!restack(root, before)) {
      root = inst.detachInstance();
      detached += 1;
      restack(root, before);
    }

    // ai_title 은 글 길이에 맞춰 아래 여백 68px 에 붙인다
    if (isTitle) {
      const bottom = Math.max(...root.findAll((n) => n.type === 'TEXT' && n.visible).map((n) => n.y + n.height));
      root.y = Math.max(135, Math.round(H - 68 - bottom));
    }

    // 완성본 보내기용: 글자 레이어 id → 자리
    const t2 = textsIn(root, '제목')[0];
    if (t2 && head) fields[t2.id] = head.field;
    const b2 = bigFirst(root)[0];
    if (b2 && body) fields[b2.id] = body.field;

    frame.setPluginData(KEY, JSON.stringify({ episodeId: data.episodeId || '', panelId: f.panelId || '', title: data.title || '', contentType: data.contentType || '', fields }));
    frames.push(frame);
  }
  if (detached) figma.notify(`글이 길어진 ${detached}장은 인스턴스를 풀어서 배치했어요. 마스터 컴포넌트에 오토 레이아웃(세로)을 넣으면 인스턴스로 유지돼요.`, { timeout: 8000 });
  return finish(frames, data, W, H, startX, '마스터 컴포넌트');
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

/* ───────── 카드뉴스 · 어쩌다 발견 (기본 템플릿, lib/work/cardDesign.ts · app/work.css .eoj 와 짝) ─────────
 * 원본 좌표는 864×1080 (피그마 1080×1350 의 0.8배) → k = W/864 로 키운다.
 * 표지: 위 그림 + 아래로 검게 + 알약(연재) · 제목 · 부제를 아래에 붙여 쌓기
 * 본문·마무리: #1A1A1A · 위아래 청록 선 · 가운데 알약 · 제목(둘째 줄 청록) · 문단 · 해시태그 / 쪽수
 */
const EJ = { bg: hex('#1A1A1A'), black: hex('#000000'), ink: hex('#FFFFFF'), accent: hex('#00EEFF'), dim: hex('#7A7A7A') };

async function tryFont(f) {
  try {
    await figma.loadFontAsync(f);
    return f;
  } catch (e) {
    return null;
  }
}

/** Pretendard → Noto Sans KR → 한글 되는 아무 글꼴 */
async function eojFonts() {
  const base = await pickFonts();
  const pick = async (styles) => {
    for (const family of ['Pretendard', 'Pretendard Variable', 'Noto Sans KR']) for (const style of styles) {
      const f = await tryFont({ family, style });
      if (f) return f;
    }
    return null;
  };
  return {
    heavy: (await pick(['ExtraBold', 'Bold'])) || base.bold,
    medium: (await pick(['Medium', 'Regular'])) || base.regular,
    regular: (await pick(['Regular'])) || base.regular,
  };
}

function ejText(parent, o) {
  const n = figma.createText();
  n.name = o.name;
  n.fontName = o.font;
  n.fontSize = o.size;
  n.lineHeight = o.line ? { unit: 'PIXELS', value: o.line } : { unit: 'AUTO' };
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

function ejRect(parent, name, x, y, w, h, fills) {
  const r = figma.createRectangle();
  r.name = name;
  r.resize(Math.max(1, w), Math.max(1, h));
  r.x = x;
  r.y = y;
  r.fills = fills;
  parent.appendChild(r);
  return r;
}

/** 청록 알약 (183×44, 글이 길면 늘어남) */
function ejPill(parent, text, fonts, k) {
  const f = figma.createFrame();
  f.name = '연재 알약';
  f.layoutMode = 'HORIZONTAL';
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'FIXED';
  f.primaryAxisAlignItems = 'CENTER';
  f.counterAxisAlignItems = 'CENTER';
  f.paddingLeft = f.paddingRight = Math.round(20 * k);
  f.cornerRadius = 22 * k;
  f.fills = [solid(EJ.accent)];
  parent.appendChild(f);
  ejText(f, { name: '연재', text: text || '어쩌다 발견', font: fonts.heavy, size: 26 * k, color: EJ.black, spacing: -0.5 * k });
  f.resize(f.width, 44 * k);
  if (f.width < 183 * k) {
    f.primaryAxisSizingMode = 'FIXED';
    f.resize(183 * k, 44 * k);
  }
  return f;
}

/** 제목 강조: 강조 단어가 있으면 그 부분, 없으면(lineFallback 일 때) 둘째 줄 */
function ejAccent(node, accent, lineFallback) {
  const t = node.characters;
  const k = accent ? t.indexOf(accent) : -1;
  if (k >= 0) node.setRangeFills(k, k + accent.length, [solid(EJ.accent)]);
  else if (lineFallback && t.indexOf('\n') > 0) node.setRangeFills(t.indexOf('\n') + 1, t.length, [solid(EJ.accent)]);
}

/** 사이트 본문(문단은 빈 줄) → 피그마 문단(\n) + 문단 안 줄바꿈(U+2028) */
const ejParas = (text) =>
  text
    .split(/\n\s*\n/)
    .map((x) => x.trim().replace(/\n/g, '\u2028'))
    .filter(Boolean)
    .join('\n');

async function buildEojjeoda(data) {
  const fonts = await eojFonts();
  const W = data.width;
  const H = data.height;
  const k = W / 864;
  const X = 64 * k;
  const IW = 736 * k;
  const series = (data.brand && data.brand.series) || '어쩌다 발견';
  const startX = rightEdge();
  const frames = [];
  const n = data.frames.length;
  let shrunk = 0;

  data.frames.forEach((f, i) => {
    const frame = figma.createFrame();
    frame.name = f.name;
    frame.resize(W, H);
    frame.x = startX + i * (W + GAP);
    frame.y = 0;
    frame.clipsContent = true;
    frame.setPluginData(KEY, JSON.stringify({ episodeId: data.episodeId || '', panelId: f.panelId || '', title: data.title || '', contentType: data.contentType || '' }));
    const by = (role) => f.texts.find((t) => t.role === role);
    const head = by('headline');
    const body = by('body');
    const accent = (by('highlight') || {}).text || '';
    const tag = by('tag');
    const src = by('source');

    if (i === 0) {
      // 표지
      frame.fills = [solid(EJ.black)];
      const heroH = Math.min(H, 848 * k);
      if (f.image && f.image.base64) {
        const img = figma.createImage(figma.base64Decode(f.image.base64));
        ejRect(frame, '이미지', 0, 0, W, heroH, [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }]);
      }
      ejRect(frame, '아래 어둡게', 0, heroH - 512 * k, W, 514 * k, [
        {
          type: 'GRADIENT_LINEAR',
          gradientTransform: [
            [0, 1, 0],
            [-1, 0, 1],
          ],
          gradientStops: [
            { position: 0, color: { r: 0, g: 0, b: 0, a: 0 } },
            { position: 0.45, color: { r: 0, g: 0, b: 0, a: 0.15 } },
            { position: 1, color: { r: 0, g: 0, b: 0, a: 1 } },
          ],
        },
      ]);
      const CX = 58 * k;
      const CW = 760 * k;
      let y = H - 108 * k;
      if (body) {
        const b = ejText(frame, { name: '부제', text: body.text, font: fonts.regular, size: 34 * k, line: 54 * k, spacing: -0.5 * k, color: EJ.ink, width: CW, field: body.field });
        b.x = CX;
        b.y = y - b.height;
        y = b.y - 34 * k;
      }
      if (head) {
        const longest = Math.max(...head.text.split('\n').map((l) => l.length));
        const size = longest <= 14 ? 77 : longest <= 18 ? 64 : 54;
        const t = ejText(frame, { name: '제목', text: head.text, font: fonts.heavy, size: size * k, line: (size * 100 / 77) * k, spacing: -2 * k, color: EJ.ink, width: CW, field: head.field });
        ejAccent(t, accent, false);
        t.x = CX;
        t.y = y - t.height;
        y = t.y - 8 * k;
      }
      const pill = ejPill(frame, series, fonts, k);
      pill.x = CX;
      pill.y = y - pill.height;
      frames.push(frame);
      return;
    }

    // 본문 · 마무리
    frame.fills = [solid(EJ.bg)];
    ejRect(frame, '위 선', X, 86 * k, IW, 2 * k, [solid(EJ.accent)]);
    const ruleBottomY = H - 77 * k;
    ejRect(frame, '아래 선', X, ruleBottomY, IW, 2 * k, [solid(EJ.accent)]);
    const pill = ejPill(frame, series, fonts, k);
    pill.x = (W - pill.width) / 2;
    pill.y = 64 * k;

    let y = 147 * k;
    if (head) {
      const t = ejText(frame, { name: '제목', text: head.text, font: fonts.heavy, size: 77 * k, line: 104 * k, spacing: -2 * k, color: EJ.ink, width: IW, field: head.field });
      ejAccent(t, accent, true);
      t.x = X;
      t.y = y;
      y = t.y + t.height + 50 * k;
    }
    y = Math.max(y, 405 * k);

    // 아래: 해시태그(없으면 출처) · 쪽수
    const footY = H - 130 * k;
    const footText = tag ? tag.text : src ? src.text : '';
    if (footText) {
      const ft = ejText(frame, { name: tag ? '해시태그' : '출처', text: tag ? footText : `출처 · ${footText}`, font: fonts.medium, size: 26 * k, color: tag ? EJ.accent : EJ.dim, field: (tag || src).field });
      if (!tag) ft.setPluginData('prefix', '출처 · ');
      ft.x = X;
      ft.y = footY;
      // 쪽수 자리를 남기고 한 줄에 안 들어가면 글자를 줄인다
      const maxW = IW - 90 * k;
      if (ft.width > maxW) ft.fontSize = Math.max(18 * k, Math.floor((ft.fontSize * maxW) / ft.width));
    }
    const pg = ejText(frame, { name: '쪽수', text: `${i + 1}/${n}`, font: fonts.medium, size: 24 * k, color: EJ.dim });
    pg.x = X + IW - pg.width;
    pg.y = footY + 2 * k;
    let bottom = footY - 30 * k;
    if (tag && src) {
      const st = ejText(frame, { name: '출처', text: `출처 · ${src.text}`, font: fonts.medium, size: 22 * k, color: EJ.dim, width: IW, field: src.field });
      st.setPluginData('prefix', '출처 · ');
      st.x = X;
      st.y = footY - 14 * k - st.height;
      bottom = st.y - 24 * k;
    }

    if (body) {
      // 넘치면 32 → 28 → 25 로 줄인다
      let b = null;
      for (const [size, line, gap] of [
        [32, 50, 50],
        [28, 44, 36],
        [25, 39, 28],
      ]) {
        if (b) b.remove();
        b = ejText(frame, { name: '본문', text: ejParas(body.text), font: fonts.regular, size: size * k, line: line * k, spacing: -0.5 * k, color: EJ.ink, width: IW, field: body.field });
        b.paragraphSpacing = gap * k;
        b.setPluginData('para', '1');
        b.x = X;
        b.y = y;
        if (b.y + b.height <= bottom) break;
        if (size === 25) shrunk += 1;
      }
    }
    frames.push(frame);
  });

  const r = finish(frames, data, W, H, startX, fonts.heavy.family, true);
  return shrunk ? `${r} · 본문이 넘치는 장 ${shrunk}개는 글을 줄여 주세요.` : r;
}

/** 프레임 글자 → 사이트 글자: 붙인 머리말('출처 · ')을 떼고, 문단(\n)·줄바꿈(U+2028)을 사이트 표기(\n\n · \n)로 되돌린다 */
function fieldText(n) {
  let t = n.characters;
  const pre = n.getPluginData('prefix');
  if (pre && t.indexOf(pre) === 0) t = t.slice(pre.length);
  if (n.getPluginData('para') === '1') return t.split('\n').map((x) => x.replace(/\u2028/g, '\n')).join('\n\n');
  return t.replace(/\u2028/g, '\n');
}

const hexOf = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const solidOf = (paints) => (Array.isArray(paints) && paints.find((x) => x.type === 'SOLID' && x.visible !== false)) || null;
const pctOf = (v, size, auto) => (!v || typeof v !== 'object' ? auto : v.unit === 'PERCENT' ? Math.round(v.value) : v.unit === 'PIXELS' ? Math.round((v.value / size) * 100) : auto);

/** 피드 4:5 프레임에서 워터마크(@…)·컷 번호(1/4)·제목(가장 큰 글자)의 글꼴·크기·색·테두리·자리를 읽는다 */
function learnLayout(frame) {
  if (Math.round(frame.width) !== 1080 || Math.round(frame.height) !== 1350) return null;
  const ox = frame.absoluteTransform[0][2];
  const oy = frame.absoluteTransform[1][2];
  const pos = (n) => ({ x: Math.round(n.absoluteTransform[0][2] - ox), y: Math.round(n.absoluteTransform[1][2] - oy) });
  const segs = (n) => n.getStyledTextSegments(['fontName', 'fontSize', 'fills', 'lineHeight', 'letterSpacing']);
  const main = (n) => segs(n).sort((a, b) => b.end - b.start - (a.end - a.start))[0];
  const texts = frame.findAll((n) => n.type === 'TEXT' && n.visible && !!n.characters.trim());
  const wm = texts.find((n) => n.characters.trim().charAt(0) === '@');
  const num = texts.find((n) => /^\s*\d+\s*\/\s*\d+\s*$/.test(n.characters));
  let title = null;
  for (const n of texts) {
    if (n === wm || n === num || n.parent !== frame) continue;
    const s = main(n);
    if (s && (!title || s.fontSize > title.s.fontSize)) title = { n, s };
  }
  const out = {};
  const ref = wm || num;
  if (ref) {
    const s = main(ref);
    const p = solidOf(s.fills);
    out.mark = { font: s.fontName, size: s.fontSize, color: p ? hexOf(p.color) : TOON_LAYOUT.mark.color, opacity: Math.round((p && p.opacity !== undefined ? p.opacity : 1) * ref.opacity * 100) / 100, y: pos(ref).y };
    if (wm) out.mark.x = pos(wm).x;
    if (num) out.mark.right = pos(num).x + Math.round(num.width);
  }
  if (title && title.s.fontSize >= 40) {
    const { n, s } = title;
    const p = solidOf(s.fills);
    const other = segs(n)
      .map((x) => solidOf(x.fills))
      .find((x) => x && p && hexOf(x.color) !== hexOf(p.color));
    const sk = solidOf(n.strokes);
    const weight = typeof n.strokeWeight === 'number' ? n.strokeWeight : 0;
    const q = pos(n);
    const align = n.textAlignHorizontal === 'JUSTIFIED' ? 'LEFT' : n.textAlignHorizontal;
    // 다음 편 제목은 길이가 달라지니 폭은 넉넉히: 가운데 맞춤이면 가운데를, 왼쪽이면 왼쪽 끝을 지킨다
    const w = Math.max(Math.round(n.width), 1080 - PAD * 2);
    const x = align === 'CENTER' ? Math.max(0, Math.round(q.x + n.width / 2 - w / 2)) : align === 'RIGHT' ? Math.round(q.x + n.width - w) : q.x;
    out.title = {
      font: s.fontName,
      size: s.fontSize,
      color: p ? hexOf(p.color) : TOON_LAYOUT.title.color,
      stroke: sk && weight > 0 ? hexOf(sk.color) : '',
      strokeWeight: weight,
      strokeAlign: n.strokeAlign,
      highlight: other ? hexOf(other.color) : TOON_LAYOUT.title.highlight,
      line: pctOf(s.lineHeight, s.fontSize, 125),
      track: pctOf(s.letterSpacing, s.fontSize, -2),
      align,
      x,
      y: q.y,
      w: align === 'LEFT' ? Math.max(Math.round(n.width), 1080 - PAD - q.x) : w,
    };
  }
  return out.mark || out.title ? out : null;
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
  // 인스타툰 피드: 고친 제목·워터마크 배치를 다음 내보내기 기본으로 기억 (이 컴퓨터 + 사이트 설정)
  let layout = null;
  if (first.contentType !== 'cardnews') {
    for (const f of frames) if (!layout) layout = learnLayout(f);
    if (layout) {
      const prev = (await figma.clientStorage.getAsync(LAYOUT_KEY)) || {};
      layout = { mark: layout.mark || prev.mark, title: layout.title || prev.title };
      await figma.clientStorage.setAsync(LAYOUT_KEY, layout);
    }
  }
  const out = [];
  for (const [k, f] of frames.entries()) {
    figma.ui.postMessage({ type: 'progress', text: `PNG로 내보내는 중… ${k + 1}/${frames.length}` });
    // 가이드(빨간 안내 영역)는 PNG에 넣지 않는다
    const guides = f.findAll((n) => n.getPluginData('guide') === '1' && n.visible);
    for (const g of guides) g.visible = false;
    let bytes;
    try {
      bytes = await f.exportAsync({ format: 'PNG', constraint: { type: 'WIDTH', value: 1080 } });
    } finally {
      for (const g of guides) g.visible = true;
    }
    const texts = f
      .findAll((n) => n.type === 'TEXT' && n.visible && !!n.getPluginData('field'))
      .map((n) => ({ field: n.getPluginData('field'), text: fieldText(n) }));
    // 마스터 인스턴스 안 글자는 프레임에 적어 둔 레이어 id 로 찾는다
    const map = metaOf(f).fields || {};
    for (const id of Object.keys(map)) {
      const n = await figma.getNodeByIdAsync(id);
      if (n && n.type === 'TEXT') texts.push({ field: map[id], text: n.characters });
    }
    out.push({ panelId: metaOf(f).panelId, name: f.name, image: { mime: 'image/png', base64: figma.base64Encode(bytes) }, texts });
  }
  return { app: 'ttuguri-studio', kind: 'final', version: 2, plugin: PLUGIN_VERSION, episodeId: first.episodeId, title: first.title, contentType: first.contentType, exportedAt: new Date().toISOString(), frames: out, layout: layout || undefined };
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
      if (data.layout) figma.notify('제목·워터마크 글꼴과 자리를 다음 내보내기 기본으로 기억했어요');
      figma.ui.postMessage({ type: 'final', data });
    } catch (e) {
      figma.ui.postMessage({ type: 'error', text: e.message || String(e) });
    }
  }
};
