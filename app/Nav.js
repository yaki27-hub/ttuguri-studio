import Link from 'next/link';

/** 상단 탭: 제작 / 작업실 / 성과 / 설정 */
export default function Nav({ active }) {
  return (
    <nav className="tabs" aria-label="메뉴">
      <Link href="/studio" className={active === 'studio' ? 'on' : ''}>제작</Link>
      <Link href="/studio/work" className={active === 'work' ? 'on' : ''}>작업실</Link>
      <Link href="/" className={active === 'stats' ? 'on' : ''}>성과</Link>
      <Link href="/studio/settings" className={active === 'settings' ? 'on' : ''}>설정</Link>
    </nav>
  );
}
