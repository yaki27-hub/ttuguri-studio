import Link from 'next/link';
import SideEpisodes from './SideEpisodes';

const ICONS = {
  work: 'M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4',
  trends: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3M8 11l2 2 4-4',
  stats: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
};

const ITEMS = [
  ['trends', '/studio/trends', '소재 찾기'],
  ['work', '/studio/work', '작업'],
  ['stats', '/stats', '성과'],
  ['settings', '/studio/settings', '설정'],
];

/** 메뉴: 폰은 위쪽 탭, 넓은 화면은 왼쪽 사이드 */
export default function Nav({ active, mobile = true }) {
  const on = active === 'studio' ? 'work' : active;
  return (
    <aside className={`side-nav${mobile ? '' : ' no-mobile'}`}>
      <Link href="/studio/work" className="side-brand">
        <span className="brand-mark" aria-hidden>뚜</span>
        뚜구리 스튜디오
      </Link>
      <nav className="tabs" aria-label="메뉴">
        {ITEMS.map(([key, href, label]) => (
          <Link key={key} href={href} className={on === key ? 'on' : ''} aria-current={on === key ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={ICONS[key]} />
            </svg>
            {label}
          </Link>
        ))}
      </nav>
      <SideEpisodes />
      <div className="side-foot">
        <b>빠른 저장</b>
        <p>작업 화면 입력칸에 인스타 링크를 붙여넣으면 레퍼런스로 저장돼요.</p>
      </div>
    </aside>
  );
}
