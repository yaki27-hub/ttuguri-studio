// 번역한 해외 인스타 게시물 → 카드뉴스 작업 만들기 (소재 찾기·비슷한 것 찾기에서 같이 씀)
import { uid } from './db'
import { fmtDate } from './format'
import { createEpisode } from './repo'

export type TranslatedSlide = { n: number; original: string; ko: string }
export type TranslatedPost = {
  username: string
  permalink: string
  caption: string
  timestamp: string
  likes: number | null
  comments: number | null
  /** 장별 이미지를 못 받고 대표 이미지(첫 장)만 읽은 경우 */
  coverOnly?: boolean
}
export type Translation = {
  post: TranslatedPost
  read: { slides: TranslatedSlide[]; captionKo: string; summary: string } | null
  readError?: string
}

/** 번역본을 '기사 읽기'에 넣을 글로 */
export function translationText({ post, read, readError }: Translation) {
  return [
    `[인스타 게시물] @${post.username} · ${post.timestamp ? fmtDate(post.timestamp) : '날짜 모름'} · ♥ ${post.likes ?? '숨김'} · 💬 ${post.comments ?? 0}`,
    read?.summary && `요약: ${read.summary}`,
    '',
    ...(read?.slides ?? []).flatMap((x) => [`[${x.n}장]`, `원문: ${x.original}`, `번역: ${x.ko}`, '']),
    post.coverOnly && '(첫 장만 읽었어요. 나머지 장은 링크를 열어 확인해 주세요.)\n',
    read?.captionKo && `[캡션 번역]\n${read.captionKo}\n`,
    `[캡션 원문]\n${post.caption}`,
    readError && `\n(이미지 속 글자는 읽지 못했어요: ${readError})`,
  ]
    .filter((x) => typeof x === 'string')
    .join('\n')
}

/** 번역본으로 카드뉴스 작업을 만든다. 번역본은 원문 단계의 '기사 읽기'에 들어간다 */
export async function episodeFromTranslation(t: Translation) {
  const { post, read } = t
  const first = (read?.summary || post.caption.split('\n')[0] || `@${post.username} 게시물`).slice(0, 80)
  return createEpisode(`[해외 인스타] @${post.username}: ${first}\n${post.permalink}`, {
    contentType: 'cardnews',
    title: first.slice(0, 40),
    titleIsAuto: true,
    links: [{ id: uid(), url: post.permalink, note: `@${post.username} 인스타 게시물` }],
    articles: [
      {
        id: uid(),
        url: post.permalink,
        title: first,
        site: `@${post.username}`,
        published: post.timestamp || undefined,
        text: translationText(t).slice(0, 20000),
        from: 'instagram',
        addedAt: new Date().toISOString(),
      },
    ],
    articleSummary: read?.summary || undefined,
  })
}
