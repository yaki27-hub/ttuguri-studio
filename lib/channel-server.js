import { cookies } from 'next/headers';
import { CHANNEL_COOKIE, normChannel } from './channel';

/** 서버 화면에서 지금 채널 읽기 */
export async function getChannel() {
  return normChannel((await cookies()).get(CHANNEL_COOKIE)?.value);
}
