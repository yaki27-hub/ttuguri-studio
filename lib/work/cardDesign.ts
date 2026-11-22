/*
 * 카드뉴스 디자인 템플릿
 *
 * 'seodang' = AI 서당 스타일 (어두운 먹색 배경 · 청록 강조 · Black Han Sans 제목)
 *   표지: 그림 위 + 가운데 정렬 큰 제목(둘째 줄 강조) + 부제 + @계정 / SWIPE →
 *   본문: 위 60% 그림(아래로 어둡게) + 번호 01 · 선 · 태그 알약 + 제목(강조 단어 청록) + 본문
 *   마무리: 그림 + 가운데 제목 + 문구 + 청록 알약 '@계정 팔로우'
 * 피그마 플러그인(public/figma-plugin/code.js)의 buildSeodang 과 짝이다.
 */
import type { CardBrand, CardDesign, CardNewsSettings } from './types'

export const CARD_DESIGN_LABEL: Record<CardDesign, string> = {
  seodang: 'AI 서당 스타일 (어두운 배경 · 청록 강조)',
  plain: '기본 (그림 위에 글자만)',
}

export const SEODANG_BRAND: CardBrand = { name: 'AI 서당', handle: '@ai.seodang', series: '오늘의 방(榜)' }

export const SEODANG_STYLE = {
  imageStyle:
    '어두운 먹색 배경(거의 검정, #090B0E 계열) 위의 한국 전통 수묵화풍 디지털 일러스트. 조선의 서당·도화서 같은 전통 공간과 소품(붓, 먹, 벼루, 두루마리, 한지, 촛불, 갓 쓴 선비·화원)에 그 장의 AI 소재를 은유로 녹인다. 먹선과 회색 톤이 중심이고, 핵심 사물이나 선에만 청록 네온빛(#5CE1E6)이 은은하게 빛난다. 낮은 조명, 영화 같은 깊이감, 차분하고 고급스러운 분위기.',
  imageRules:
    '실제 회사 로고·상표를 그리지 않기\n실존 인물 얼굴 금지\n화면·종이·현판 속 글씨는 선이나 빈칸으로만 (한자·한글 글자 금지)\n밝은 배경·파스텔 색 금지, 청록 외 강한 원색 금지',
}

/** 이 템플릿으로 설정 채우기 (계정 소개·참고 이미지는 그대로) */
export function applySeodang(c: CardNewsSettings): CardNewsSettings {
  return { ...c, ...SEODANG_STYLE, design: 'seodang', brand: { ...SEODANG_BRAND, ...c.brand } }
}

export const designOf = (c: Pick<CardNewsSettings, 'design'>): CardDesign => c.design ?? 'seodang'
export const brandOf = (c: Pick<CardNewsSettings, 'brand'>): CardBrand => ({ ...SEODANG_BRAND, ...c.brand })
