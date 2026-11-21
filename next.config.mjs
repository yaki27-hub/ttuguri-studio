/** @type {import('next').NextConfig} */
const nextConfig = {
  // 이미지 생성 때 캐릭터 레퍼런스(브라우저에서 줄인 것)를 함께 보낸다. Vercel 요청 한도 4.5MB 안쪽.
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
};
export default nextConfig;
