/*
 * 뚜구리툰 숏폼 후킹 라이브러리 v1.0
 * 숏폼 훅 실전 가이드 26개를 뚜구리툰에 맞게 각색한 것. 번호(H01~H26)는 성과 비교에 쓰므로 바꾸지 않는다.
 * next·twist 는 아직 만들지 않은 편의 '콘티 후보'다. 실제 경험으로 확정된 내용이 아니다.
 */
export type HookGrade = 'A' | 'B' | 'C'

export interface Hook {
  id: string
  grade: HookGrade
  title: string
  hook: string
  type: string
  /** 원본 공식 */
  formula?: string
  next: string
  twist?: string
}

export const HOOK_GRADE_LABEL: Record<HookGrade, string> = {
  A: 'A 우선 제작',
  B: 'B 확장용',
  C: 'C 정보·경험',
}

export const HOOKS: Hook[] = [
  // A등급 — 우선 제작
  { id: 'H13', grade: 'A', title: '모니터 보는 사람', formula: '저만 [상황]에서 이러는 줄 알았어요.', hook: '저만 누가 모니터 보면 갑자기 일 못 하나요?', type: '회사생활 / 공감형', next: '옆 사람이 모니터를 보는 순간 뚜구리 손이 멈춤.', twist: '방금까지 뭘 하고 있었는지 까먹음.' },
  { id: 'H01', grade: 'A', title: '팀장님 휴가', formula: '[조건] 있을 때의 나 / 없을 때의 나', hook: '팀장님 휴가일 때의 나 / 출근했을 때의 나', type: '회사생활 / 비교형', next: '여유로운 뚜구리와 알림에 긴장한 뚜구리 비교.' },
  { id: 'H16', grade: 'A', title: '퇴근 5분 전', formula: 'A와 B 중 선택', hook: '퇴근 5분 전, 더 싫은 말은?', type: '직장인 밈 / 참여형', next: 'A. 하나만 수정해 주세요. / B. 잠깐 회의 가능하세요?', twist: '둘 다 동시에 들음.' },
  { id: 'H15', grade: 'A', title: '신입 시절의 착각', formula: '처음 했을 때 가장 크게 착각한 것', hook: '신입 때는 야근하면 인정받는 줄 알았어요.', type: '실화툰 / 경험담', next: '열심히 야근하는 뚜구리. 다음 날 새로운 업무가 또 쌓임.' },
  { id: 'H19', grade: 'A', title: '회사에 정을 안 주는 이유', formula: '그만둔 구체적인 계기', hook: '제가 회사에 정을 안 주게 된 이유가 있어요.', type: '회사생활 / 사연형', next: '본업 외 청소와 잡무까지 담당하게 된 뚜구리.', twist: '내 직업이 디자이너였던 것 같은데?' },
  { id: 'H09', grade: 'A', title: '퇴근 후 자기계발', formula: '다들 하라는데 실제로 해보면?', hook: '퇴근 후 자기계발하라길래 직접 해봤어요.', type: '일상 / 도전형', next: '운동복, 책, 노트북까지 준비한 뚜구리.', twist: '결국 소파에 누워 있음.' },
  { id: 'H04', grade: 'A', title: '18년 차의 회사어', formula: '무엇을 해야 할지 모르겠어.', hook: '18년 차인데도 아직 회사어를 모르겠어요.', type: '디자이너 / 공감형', next: '현업은 이미지 변경 요청, PL은 페이지 전체 변경 요청.', twist: '나는 대체 뭘 바꾸면 되는 거지?' },
  { id: 'H06', grade: 'A', title: '어느 회사에나 있는 사람', formula: '쓸 만한 아이디어는 다 누가 먼저 했어.', hook: '어느 회사를 가든 꼭 한 명씩 있는 사람.', type: '회사생활 / 관찰형', next: '회사만 바뀌고 똑같은 유형의 동료가 계속 등장.' },
  { id: 'H11', grade: 'A', title: '퇴근 후 앱 개발', formula: '제한된 시간으로 결과까지 갈 수 있을까?', hook: '퇴근 후 딱 2시간으로 앱 하나 만들 수 있을까?', type: '앱 개발 / 도전형', next: '앱 제작 성공 후 홈택스 사업자등록 페이지를 발견.', twist: '개발보다 행정 절차가 더 어려움.' },
  // B등급 — 확장용
  { id: 'H02', grade: 'B', title: '프리랜서의 현실', hook: '프리랜서 시작 전에 아무도 안 알려준 게 있어요.', type: '프리랜서 / 경험담', next: '자유로운 생활을 상상했는데 계약서, 세금, 견적서를 작성하는 뚜구리.' },
  { id: 'H05', grade: 'B', title: '칼퇴 챌린지', hook: '우리 오늘은 진짜 칼퇴해 볼래?', type: '회사생활 / 제안형', next: '의기투합한 동료들. 퇴근 직전에 회의 초대가 도착.' },
  { id: 'H08', grade: 'B', title: '이직하기 전 확인', hook: '이직하기 직전 꼭 확인하는 게 하나 있어요.', type: '직장생활 / 정보형', next: '연봉만 비교하던 뚜구리가 근무 조건과 계약 내용을 확인.' },
  { id: 'H12', grade: 'B', title: '첫 앱의 모습', hook: '제 첫 앱, 처음엔 이렇게 생겼어요.', type: '앱 개발 / 비포애프터', next: '첫 화면부터 완성 화면까지 빠르게 비교.' },
  { id: 'H17', grade: 'B', title: 'AI로 업무 줄이기', hook: '매번 복붙하던 업무를 AI에게 시켜봤어요.', type: '디자이너 / AI', next: '반복 업무를 자동화한 뚜구리.', twist: '시간이 생겼더니 일이 더 들어옴.' },
  { id: 'H24', grade: 'B', title: '앱 개발 비용', hook: '혼자 앱 하나 만들면 돈이 얼마나 들까요?', type: '앱 개발 / 궁금증형', next: '실제 사용한 툴 구독료, 서비스 비용, 제작 시간을 공개.' },
  { id: 'H26', grade: 'B', title: '수정 요청의 후유증', hook: '수정 요청 100번 받아보면 생기는 습관.', type: '디자이너 / 공감형', next: '수정 요청이 오자 바로 파일을 복제하고 버전을 저장하는 뚜구리.' },
  // C등급 — 정보·경험 공유
  { id: 'H03', grade: 'C', title: '퇴근 습관', hook: '퇴근을 지켜주는 10점짜리 습관.', type: '직장인 / 팁', next: '저장, 백업, 메신저 정리하는 뚜구리.' },
  { id: 'H07', grade: 'C', title: '다시 신입이 된다면', hook: '다시 신입 디자이너가 된다면 첫 한 달은 이렇게 할래요.', type: '디자이너 / 조언', next: '야근보다 질문, 기록, 요구사항 확인에 집중.' },
  { id: 'H10', grade: 'C', title: '수정 요청이 끝나지 않는 이유', hook: '수정 요청이 끝없이 늘어난다면 이 말부터 확인하세요.', type: '디자이너 / 정보형', next: "사람마다 다른 '간단한 수정'의 의미." },
  { id: 'H14', grade: 'C', title: '프리랜서 첫 조언', hook: '처음 프리랜서 하는 친구에게 꼭 하는 말.', type: '프리랜서 / 조언', next: '자유로운 일상을 상상하는 친구에게 계약 조건부터 확인하라고 조언.' },
  { id: 'H18', grade: 'C', title: '수정 지옥 탈출', hook: '수정 지옥에 빠질 때 제가 꼭 하는 말.', type: '디자이너 / 정보형', next: '어떤 부분을 어떻게 변경해야 하는지 구체적으로 되묻는 뚜구리.' },
  { id: 'H20', grade: 'C', title: '처음 보는 UI', hook: '이 화면, 처음 보는 사람도 이해할까요?', type: 'UX / 디자인', next: '제작자에게는 익숙하지만 사용자는 이해하기 어려운 화면.' },
  { id: 'H21', grade: 'C', title: '디자인 툴', hook: '디자인 툴 여러 개 써봤는데 결국 이걸 켜요.', type: '디자이너 / 도구', next: '다양한 툴 사이를 오가다가 익숙한 작업 환경으로 복귀.' },
  { id: 'H22', grade: 'C', title: '디자인 선택', hook: '이 디자인에서 가장 먼저 눈에 들어오는 건 뭐예요?', type: 'UX / 참여형', next: '두 가지 시각적 위계를 비교.' },
  { id: 'H23', grade: 'C', title: 'AI 첫 프로젝트', hook: 'AI로 뭔가 하나 만들어 본다면 이거부터 해보세요.', type: 'AI / 앱 개발', next: '작은 기능에서 시작해 점점 커지는 프로젝트.' },
  { id: 'H25', grade: 'C', title: '댓글 질문 실험', hook: '댓글에서 물어본 그거, 직접 해봤어요.', type: '소통 / 실험형', next: '실제 댓글 질문과 작업 결과를 함께 공개.' },
]

/** 초기 제작 순서 (첫 4주) */
export const HOOK_PLAN: { week: number; ids: string[] }[] = [
  { week: 1, ids: ['H13', 'H01'] },
  { week: 2, ids: ['H16', 'H15'] },
  { week: 3, ids: ['H19', 'H06'] },
  { week: 4, ids: ['H09', 'H04', 'H11'] },
]

export const hookById = (id?: string) => (id ? HOOKS.find((h) => h.id === id) : undefined)

/** C등급(정보·조언)은 정보툰, 나머지는 4컷으로 시작 */
export const hookFormat = (h: Hook) => (h.grade === 'C' ? ('info' as const) : ('four' as const))

/** 콘티 프롬프트에 붙이는 후킹 규칙 */
export function hookBlock(id?: string) {
  const h = hookById(id)
  if (!h) return ''
  return [
    `후킹 라이브러리 ${h.id} (${h.type}):`,
    `- 첫 화면 문구: "${h.hook}" — 1~3초 안에 읽히게. 다듬어도 뜻과 구조는 유지.`,
    `- 다음 컷 후보: ${h.next}`,
    h.twist && `- 반전 후보: ${h.twist}`,
    '- 첫 장에서는 상황만 보여 주고 결말은 숨긴다. 다음 컷은 후킹에서 꺼낸 상황을 바로 이어간다.',
    '- 마지막 컷은 설명보다 표정, 침묵, 짧은 대사로.',
    '- 다음 컷·반전 후보는 실제 경험이 아니라 콘티 후보다. 원문 메모에 없는 내용을 쓰면 adaptationNotes에 "각색 제안"이라고 적어.',
  ]
    .filter(Boolean)
    .join('\n')
}
