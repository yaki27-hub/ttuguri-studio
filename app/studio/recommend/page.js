import Link from 'next/link';
import { isAuthed } from '@/lib/auth';
import { envStatus } from '@/lib/env-status';
import { getChannel } from '@/lib/channel-server';
import Login from '../../Login';
import RecommendClient from './RecommendClient';
import CardRecommend from './CardRecommend';
import Nav from '../../Nav';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function RecommendPage({ searchParams }) {
  const params = await searchParams;
  if (!(await isAuthed())) return <Login />;
  const card = (await getChannel()) === 'card';

  return (
    <main className="wrap narrow">
      <Nav active="work" mobile={false} />
      <header className="sub-top">
        <Link href="/studio/work" className="back" aria-label="작업으로">←</Link>
        <h1>{card ? '카드뉴스 소재 추천' : '소재 추천'}</h1>
      </header>
      {params?.msg && <p className="flash">{params.msg}</p>}
      {card ? (
        <>
          <p className="muted small intro">
            오늘 AI 소식(한국·해외·공식 발표)과 최근에 만든 카드뉴스를 보고, 저장하고 싶어지는 정보 카드뉴스 소재를 추천해요.
            고른 소재는 근거 기사 링크와 함께 카드뉴스 편으로 만들어져요.
          </p>
          <CardRecommend aiReady={envStatus().ai.ready} />
        </>
      ) : (
        <>
          <p className="muted small intro">
            내 메모를 먼저 살리고, 지금 시기·오늘 급상승 검색어·지금까지의 성과를 참고해서 추천해요.
            고른 소재는 노션에 <b>스토리</b> 단계로 저장됩니다.
          </p>
          <RecommendClient />
        </>
      )}
    </main>
  );
}
