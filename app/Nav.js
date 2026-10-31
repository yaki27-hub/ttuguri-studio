import Link from 'next/link';

/** 상단 탭: 제작 / 성과 */
export default function Nav({ active }) {
  return (
    <nav className="tabs" aria-label="메뉴">
      <Link href="/studio" className={active === 'studio' ? 'on' : ''}>제작</Link>
      <Link href="/" className={active === 'stats' ? 'on' : ''}>성과</Link>
    </nav>
  );
}
