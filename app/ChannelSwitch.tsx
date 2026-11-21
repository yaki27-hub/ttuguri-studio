'use client'

import { useRouter } from 'next/navigation'
import { CHANNELS, CHANNEL_COOKIE } from '@/lib/channel'

/** 메뉴 맨 위: 뚜구리툰 / AI 카드뉴스 전환 (쿠키에 저장하고 화면을 다시 그린다) */
export default function ChannelSwitch({ channel }: { channel: 'toon' | 'card' }) {
  const router = useRouter()
  return (
    <div className="channel-switch" role="radiogroup" aria-label="채널 선택">
      {Object.values(CHANNELS).map((c) => (
        <button
          key={c.id}
          type="button"
          className={channel === c.id ? 'on' : ''}
          role="radio"
          aria-checked={channel === c.id}
          onClick={() => {
            if (channel === c.id) return
            document.cookie = `${CHANNEL_COOKIE}=${c.id}; path=/; max-age=31536000; samesite=lax`
            // 다른 채널의 편 화면에 있었다면 그 채널의 작업 첫 화면으로
            if (location.pathname.startsWith('/studio/work/')) router.push('/studio/work')
            router.refresh()
          }}
        >
          <span className="ch-icon" aria-hidden>
            {c.icon}
          </span>
          <span className="ch-text">
            <b>{c.label}</b>
            <small>{c.sub}</small>
          </span>
        </button>
      ))}
    </div>
  )
}
