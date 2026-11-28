/*
 * 뚜구리툰 그림 설정 v1.0 (2026-11-28)
 * 근거: 프로젝트 지침 v1.4, 이미지 프롬프트 규칙(4:5, 주인공 위치), @ttuguri 계정 점검(A 강의 진단 기준), 성과 대시보드 분석
 *
 * status
 * - fixed    [확정]     항상 적용
 * - proposed [제안]     기본 적용. 설정에서 끌 수 있고, 승인하면 확정으로 옮긴다
 * - check    [확인 필요] 피드에서 관찰한 것. 공식 설정인지 확인하고 켜야 적용된다
 *
 * prompt  : 인스타툰 컷 이미지 프롬프트(Gemini·Higgsfield)에 들어가는 한 줄
 * konti   : 콘티 프롬프트에 들어가는 한 줄
 */
import type { CharacterSettings } from './types'

export const ART_GUIDE_VERSION = 'v1.0 (2026-11-28)'

export type ArtStatus = 'fixed' | 'proposed' | 'check'
export const ART_STATUS_LABEL: Record<ArtStatus, string> = { fixed: '확정', proposed: '제안', check: '확인 필요' }

export interface ArtRule {
  id: string
  sec: string
  status: ArtStatus
  text: string
  prompt?: string
  konti?: string
}

export const ART_SECTIONS = ['0. 최우선 원칙', '1. 캐릭터 외형', '2. 주변 인물', '3. 화면 규격과 배치', '4. 밀도와 배경', '5. 카메라와 연기', '6. 텍스트와 마감', '7. 이미지 프롬프트'] as const

export const ART_RULES: ArtRule[] = [
  // 0
  { id: 'fixLook', sec: ART_SECTIONS[0], status: 'fixed', text: '캐릭터 외형은 고정하고, 카메라와 연기는 자유롭게 구성한다.', prompt: '캐릭터 외형은 레퍼런스 그대로 고정하고, 카메라와 연기(포즈·표정)는 이 컷에 맞게 자유롭게.' },
  { id: 'silentFunny', sec: ART_SECTIONS[0], status: 'fixed', text: '대사를 가려도 표정과 행동만으로 웃음이 전달되는지 본다.', prompt: '대사 없이 표정과 몸짓만으로 상황과 감정이 읽히게.', konti: '대사를 가려도 표정과 행동만으로 웃음이 전달되게 짜.' },
  { id: 'readable', sec: ART_SECTIONS[0], status: 'proposed', text: '그림의 목표는 "잘 그린 장면"이 아니라 "한눈에 읽히는 장면"이다. 볼거리가 많으면 표정 연기가 묻힌다.', prompt: '목표는 잘 그린 장면이 아니라 한눈에 읽히는 장면. 볼거리를 늘리지 말고 표정 연기가 먼저 보이게.' },
  // 1
  { id: 'figmaFirst', sec: ART_SECTIONS[1], status: 'fixed', text: '기준은 Figma에서 최종 확정한 디자인이다. 아래 목록과 충돌하면 Figma(=캐릭터 레퍼런스)가 우선이다.' },
  { id: 'exaggerate', sec: ART_SECTIONS[1], status: 'fixed', text: '일시적인 과장(극화체, 찌그러진 얼굴, 커진 눈과 입)은 허용한다. 단, 뚜구리로 알아볼 수 있어야 한다.', prompt: '극화체·찌그러진 얼굴·커진 눈과 입 같은 일시적 과장은 괜찮지만, 같은 캐릭터로 알아볼 수 있어야 해.' },
  { id: 'noNewAbility', sec: ART_SECTIONS[1], status: 'fixed', text: '시그니처 행동이나 특별한 능력을 임의로 추가하지 않는다.', prompt: '새로운 시그니처 동작·특수 능력·변신을 지어내지 마.', konti: '캐릭터에게 시그니처 행동이나 특별한 능력을 새로 만들어 주지 마.' },
  { id: 'idMarks', sec: ART_SECTIONS[1], status: 'check', text: '식별 요소: 둥근 갈색 몸통과 머리가 하나로 이어진 실루엣, 반쯤 감긴 무덤덤한 눈, 주황색 뾰족한 코, 볼 터치, 앞니 두 개, 주황색 손, 파란 목줄의 사원증.', prompt: '식별 요소 유지: 둥근 갈색 몸통과 머리가 하나로 이어진 실루엣, 반쯤 감긴 무덤덤한 눈(기본 표정), 주황색 뾰족한 코, 볼 터치, 앞니 두 개, 주황색 손, 파란 목줄 사원증.' },
  { id: 'outfit', sec: ART_SECTIONS[1], status: 'check', text: '의상(맨몸, 회색 후드, 셔츠와 넥타이, 담요 등)과 소품은 장면에 맞게 바꾸되, 식별 요소는 가리지 않는다.', prompt: '의상·소품은 장면에 맞게 바꿔도 되지만 얼굴·코·손·사원증 같은 식별 요소는 가리지 마.' },
  // 2
  { id: 'anon', sec: ART_SECTIONS[2], status: 'fixed', text: '주변 인물은 얼굴과 특징을 생략한 익명 실루엣으로 표현한다.', prompt: '주변 인물은 얼굴·이목구비를 생략한 익명 실루엣으로.', konti: '주변 인물은 이름 대신 역할로 적고, 얼굴 없는 익명 실루엣으로 연출해.' },
  { id: 'notStronger', sec: ART_SECTIONS[2], status: 'fixed', text: '주변 인물이 뚜구리보다 강조되지 않게 한다.', prompt: '주변 인물이 주인공보다 크거나 선명하게 강조되지 않게.' },
  { id: 'monoSil', sec: ART_SECTIONS[2], status: 'proposed', text: '실루엣은 단색 한 톤으로 통일한다(예: 남색 상사 실루엣). 필요한 정보는 이름표 한 줄로만 준다(이름표는 Figma에서).', prompt: '실루엣은 단색 한 톤(예: 남색)으로 채우고 디테일을 넣지 마.' },
  { id: 'noRealPeople', sec: ART_SECTIONS[2], status: 'proposed', text: '실사풍 인물이나 얼굴이 보이는 군중은 쓰지 않는다.', prompt: '실사풍 사람, 얼굴이 보이는 군중은 그리지 마.' },
  // 3
  { id: 'feedSize', sec: ART_SECTIONS[3], status: 'fixed', text: '피드(캐러셀) 비율 4:5, 1080×1350px.' },
  { id: 'lowCenter', sec: ART_SECTIONS[3], status: 'fixed', text: '뚜구리는 화면 중심보다 약간 아래에 둔다.', prompt: '주인공은 화면 중심보다 약간 아래에 둬.' },
  { id: 'top25', sec: ART_SECTIONS[3], status: 'proposed', text: '위쪽 약 25%는 제목이나 말풍선 자리로 비워 둔다.', prompt: '위쪽 약 25%는 제목·말풍선이 올라갈 단순한 여백으로 비워 둬.' },
  { id: 'gridSafe', sec: ART_SECTIONS[3], status: 'proposed', text: '프로필 그리드는 3:4로 잘라 보여 준다. 제목과 말풍선은 좌우 끝에서 최소 60px 안쪽에 둔다.', prompt: '프로필 그리드에서 좌우가 잘리니 주인공·핵심 소품은 좌우 끝에 붙이지 말고 안쪽에.' },
  { id: 'reels916', sec: ART_SECTIONS[3], status: 'proposed', text: '릴스는 4:5 그림을 그대로 9:16에 넣지 않고 9:16(1080×1920) 레이아웃을 따로 만든다. 위 여백엔 제목을 크게, 아래는 배경색 연장.' },
  { id: 'reelsUI', sec: ART_SECTIONS[3], status: 'proposed', text: '릴스는 아래 약 20%와 오른쪽 끝이 인스타 UI에 가려지므로 대사를 두지 않는다. 릴스 커버의 제목은 가운데에 모은다.' },
  { id: 'reelsFirst', sec: ART_SECTIONS[3], status: 'proposed', text: '신규 도달은 릴스에서만 나오고 있으므로(조회 1,000 이상 6편이 모두 릴스) 릴스를 기본으로 하고, 피드 중복 게시는 줄인다.' },
  // 4
  { id: 'props3', sec: ART_SECTIONS[4], status: 'proposed', text: '배경 소품은 장면 이해에 필요한 것만 최대 2~3개(예: 책상, 모니터, 머그컵).', prompt: '배경 소품은 장면 이해에 꼭 필요한 것만 2~3개 이하.' },
  { id: 'dimBg', sec: ART_SECTIONS[4], status: 'proposed', text: '배경은 채도와 대비를 낮추고, 뚜구리와 핵심 소품만 선명하게 한다.', prompt: '배경은 채도와 대비를 낮추고, 주인공과 핵심 소품만 선명하게.' },
  { id: 'decoEmotion', sec: ART_SECTIONS[4], status: 'proposed', text: '그라데이션 조명, 창밖 도시, 화분, 책장 같은 장식 요소는 감정 컷(평온함, 허무함 강조)에만 쓴다.', prompt: '그라데이션 조명·창밖 도시·화분·책장 같은 장식은 평온함이나 허무함을 강조하는 감정 컷이 아니면 넣지 마.' },
  { id: 'contrastCuts', sec: ART_SECTIONS[4], status: 'proposed', text: '평범한 컷은 단순하게, 웃음 포인트 컷만 연출(집중선, 극화체, 어두운 배경)을 넣는다.', prompt: '이 컷이 웃음 포인트(반전·충격)일 때만 집중선·극화체·어두운 배경 같은 연출을 쓰고, 평범한 컷은 단순하게.', konti: '평범한 컷은 단순하게 두고, 웃음 포인트 컷에만 집중선·극화체·어두운 배경 같은 연출을 direction에 적어.' },
  { id: 'oneAction', sec: ART_SECTIONS[4], status: 'fixed', text: '한 장면에 핵심 행동은 하나만 둔다.', prompt: '한 장면에 핵심 행동은 하나만.' },
  // 5
  { id: 'noFrontOnly', sec: ART_SECTIONS[5], status: 'fixed', text: '정면 기본 포즈만 반복하지 않는다. 정면, 측면, 3/4 각도, 뒷모습, 하이앵글, 로우앵글, 클로즈업, 초근접, 롱샷, 기울어진 구도 중 상황에 맞게 고른다.', prompt: '정면 차렷 포즈를 피하고 측면·3/4·뒷모습·하이앵글·로우앵글·기울어진 구도 중 이 컷에 맞는 각도로.', konti: '정면 기본 포즈만 반복하지 말고 정면·측면·3/4·뒷모습·하이/로우앵글·초근접·롱샷·기울어진 구도 중에서 골라.' },
  { id: 'calmVsBig', sec: ART_SECTIONS[5], status: 'fixed', text: '평범한 컷과 과장된 컷을 대비시킨다(예: 와이드샷 → 측면 → 클로즈업 → 작은 뒷모습 / 평범한 대화 → 극화체 충격 → 무표정).', konti: '평범한 컷과 과장된 컷을 대비시켜(예: 와이드 → 측면 → 클로즈업 → 작은 뒷모습, 평범한 대화 → 극화체 충격 → 무표정).' },
  { id: 'bodyOptional', sec: ART_SECTIONS[5], status: 'fixed', text: '몸으로 하는 반응(굳기, 미끄러지기, 엎드리기, 움츠러들기, 천천히 고개 돌리기)은 연출 선택지일 뿐 고정 행동이 아니다.', konti: '굳기·미끄러지기·엎드리기·움츠러들기·천천히 고개 돌리기는 선택지일 뿐, 매번 같은 반응을 쓰지 마.' },
  { id: 'bestPattern', sec: ART_SECTIONS[5], status: 'proposed', text: "가장 잘 먹힌 시각 패턴은 '평온한 1컷 → 사건 → 극화체 회상 → 무덤덤한 반응'이다('발신자 표시의 공포'). 쓰되 매번 같은 구도로 반복하지 않는다.", konti: "잘 먹힌 흐름 '평온한 1컷 → 사건 → 극화체 회상 → 무덤덤한 반응'을 참고하되, 매번 같은 구도로 반복하지는 마." },
  // 6
  { id: 'noTextImg', sec: ART_SECTIONS[6], status: 'fixed', text: '이미지에는 제목, 대사, 말풍선 텍스트를 넣지 않는다. 텍스트는 모두 Figma에서 입력한다.' },
  { id: 'titleFont', sec: ART_SECTIONS[6], status: 'proposed', text: '제목은 굵은 고딕체, 진한 갈색 계열.' },
  { id: 'lineFont', sec: ART_SECTIONS[6], status: 'proposed', text: '대사는 손글씨체 말풍선, 한 컷에 2~3줄 이하. 그림과 겹치면 흰 말풍선이나 반투명 박스를 깐다.', konti: '대사는 한 컷에 2~3줄을 넘기지 마.' },
  { id: 'watermark', sec: ART_SECTIONS[6], status: 'proposed', text: "워터마크는 '@ttuguri' 하나로 통일(왼쪽 위), 컷 번호는 오른쪽 위. 시리즈 배지는 오른쪽 위 한 곳에 같은 모양으로." },
  // 7
  { id: 'onRequest', sec: ART_SECTIONS[7], status: 'fixed', text: '사용자가 요청할 때만 이미지를 만든다. 확정된 캐릭터 레퍼런스를 항상 같이 쓴다. 프롬프트는 한국어로 쓴다.' },
  { id: 'cameraFirst', sec: ART_SECTIONS[7], status: 'proposed', text: '콘티에서 정한 카메라 방향과 포즈를 프롬프트 첫 줄에 적는다. "글자 없음, 말풍선 없음"과 "위쪽 여백 확보"를 매번 명시한다.' },
]

/** 업로드 전 그림 검수 9항목 */
export const ART_CHECKS = [
  { id: 'look', label: '확정된 뚜구리 외형(Figma)과 식별 요소가 유지됐다' },
  { id: 'silhouette', label: '주변 인물이 얼굴 없는 실루엣이다' },
  { id: 'bg', label: '배경이 표정보다 눈에 먼저 들어오지 않는다' },
  { id: 'silent', label: '대사를 가려도 표정과 행동으로 상황이 읽힌다' },
  { id: 'contrast', label: '평범한 컷과 과장된 컷의 대비가 있다' },
  { id: 'grid', label: '그리드 썸네일(3:4)에서 제목·말풍선이 잘리지 않는다' },
  { id: 'reels', label: '릴스는 9:16 전용 레이아웃이고, UI에 가리는 자리에 대사가 없다' },
  { id: 'watermark', label: "워터마크가 '@ttuguri'이고 정해진 자리(왼쪽 위)에 있다" },
  { id: 'dup', label: '같은 편을 피드와 릴스에 중복으로 올리지 않는다' },
] as const

/** 이 규칙이 지금 적용 중인가 (확정은 항상, 제안은 기본 켜짐, 확인 필요는 켜야 적용) */
export function ruleOn(r: ArtRule, s: Pick<CharacterSettings, 'artRules'>) {
  if (r.status === 'fixed') return true
  const v = s.artRules?.[r.id]
  return typeof v === 'boolean' ? v : r.status === 'proposed'
}

export const activeRules = (s: Pick<CharacterSettings, 'artRules'>) => ART_RULES.filter((r) => ruleOn(r, s))

/** 컷 이미지 프롬프트에 넣을 그림 규칙 줄 */
export function artPromptLines(s: Pick<CharacterSettings, 'artRules'>) {
  return activeRules(s).map((r) => r.prompt).filter((x): x is string => !!x)
}

/** 콘티 프롬프트에 넣을 연출 규칙 줄 */
export function artKontiLines(s: Pick<CharacterSettings, 'artRules'>) {
  return activeRules(s).map((r) => r.konti).filter((x): x is string => !!x)
}
