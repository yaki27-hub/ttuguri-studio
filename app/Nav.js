import Link from 'next/link';

/** 상단 탭: 작업 / 성과 / 설정 */
export default function Nav({ active }) {
  return (
    <nav className="tabs" aria-label="메뉴">
      <Link href="/studio/work" className={active === 'work' || active === 'studio' ? 'on' : ''}>작업</Link>
      <Link href="/stats" className={active === 'stats' ? 'on' : ''}>성과</Link>
      <Link href="/studio/settings" className={active === 'settings' ? 'on' : ''}>설정</Link>
    </nav>
  );
}
