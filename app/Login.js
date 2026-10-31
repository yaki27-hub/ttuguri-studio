import { login } from './actions';

export default function Login({ error }) {
  const configured = Boolean(process.env.DASHBOARD_PASSWORD);
  return (
    <main className="login">
      <form action={login} className="login-card">
        <div className="brand-mark" aria-hidden>뚜</div>
        <h1>뚜구리 스튜디오</h1>
        <p className="muted">@ttuguri 제작·성과 관리</p>
        {configured ? (
          <>
            <input type="password" name="password" placeholder="비밀번호" autoFocus required />
            {error && <p className="error">비밀번호가 맞지 않아요.</p>}
            <button className="btn primary" type="submit">들어가기</button>
          </>
        ) : (
          <p className="error">Vercel 환경변수 DASHBOARD_PASSWORD 를 먼저 설정해 주세요.</p>
        )}
      </form>
    </main>
  );
}
