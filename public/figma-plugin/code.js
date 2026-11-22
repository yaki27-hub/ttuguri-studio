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

  // 한 편을 섹션으로 묶는다 (안 되는 환경이면 프레임만)
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
  return `${frames.length}개 프레임을 만들었어요${noImage ? ` (이미지 없는 장 ${noImage}개)` : ''}. 글꼴: ${fonts.bold.family}`;
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
