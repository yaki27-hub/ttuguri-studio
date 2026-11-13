# 인스타그램 스킬 (Claude Code용)

이 레포를 Claude Code(클라우드 세션 포함)로 열면 아래 스킬을 쓸 수 있어요.
원본: [Jakeschincariol/instagram-agent-skill](https://github.com/Jakeschincariol/instagram-agent-skill) (MIT, `reference/LICENSE-instagram-agent-skill`)

| 명령 | 하는 일 |
|---|---|
| `/ig-audit` | 지난 게시물 분석. 내 평균 대비 배수, 비팔로워 도달 비율로 판단 |
| `/ig-plan` | 주간 게시 계획 (릴스 비중, 형식 섞기, 교류할 계정) |
| `/ig-profile` | 프로필 100점 채점과 고칠 문구 |
| `/ig-caption` | 캡션 작성 + `caption.py` 검사 (125자 미리보기, 해시태그 5개 제한) |
| `/ig-reply` | 내 게시물 댓글 분류와 답글 초안 |
| `/ig-carousel` | 캐러셀 구성 (표지, 장별 문구) |

스킬은 글만 써요. 인스타에 직접 올리거나 댓글을 다는 일은 하지 않아요.

## 이 폴더

- `voice.md` — 계정 설정. 모든 스킬이 먼저 읽어요. 빈 칸은 직접 채워 주세요.
- `reference/hooks.json` — 릴스 후킹 공식 26개 (참고용, 영어)
- `plan.md`, `log.md`, `swipe.md` — 스킬이 필요할 때 만드는 파일

## 원본에서 바꾼 점

- 설치하지 않은 스킬: `ig-reel`, `ig-viral`, `ig-comment`, `ig-human`, `ig-story`, `ig-dm`, `ig-repurpose`.
  그 스킬로 넘기라는 안내는 직접 하거나 `reference/hooks.json`을 보도록 바꿨어요.
- 파일 경로 `~/.claude/instagram/`을 레포 안 `.claude/instagram/`으로 바꿨어요. 클라우드 세션은 끝나면 홈 폴더가 사라지기 때문이에요.
- `ig-caption/caption.py`: 한글 해시태그 세기, 한국어 행동 유도 문구 인식, 한글 폭에 맞춘 미리보기 상자.
