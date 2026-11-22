import Nav from '../Nav';

/** 인스타·노션을 불러오는 동안(최대 수십 초) 보이는 자리 표시 */
export default function Loading() {
  return (
    <main className="wrap" aria-busy="true">
      <Nav active="stats" />
      <p className="flash" role="status">인스타그램·노션에서 성과를 불러오는 중이에요… 게시물이 많으면 30초쯤 걸려요.</p>
      <section className="kpis" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="skel skel-kpi" />)}
      </section>
      <div className="skel skel-chart" aria-hidden />
      {Array.from({ length: 3 }, (_, i) => <div key={i} className="skel skel-row" aria-hidden />)}
    </main>
  );
}
