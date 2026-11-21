// 뚜구리 가져오기 — 사이트에서 내보낸 .json 으로 프레임을 만든다.
// 파일 형식은 lib/work/figmaExport.ts 와 맞춘다 (version 1).

figma.showUI(__html__, { width: 340, height: 270 });

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

figma.ui.onmessage = async (msg) => {
  if (msg.type !== 'import') return;
  try {
    const text = await build(msg.data);
    figma.notify(text);
    figma.ui.postMessage({ type: 'done', text });
  } catch (e) {
    figma.ui.postMessage({ type: 'error', text: `만들지 못했어요: ${e.message || e}` });
  }
};
