import './globals.css';

export const metadata = {
  title: '뚜구리 스튜디오',
  description: '뚜구리툰 인스타그램 성과 대시보드',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
