/* 브라우저 전용: 이미지 생성 요청에 붙일 참고 이미지 줄이기, 생성 결과를 파일로 바꾸기 */
import { getAsset } from './repo'

/** 캐릭터 레퍼런스를 긴 변 768px JPEG로 줄여 base64로 (서버 요청 한도 때문) */
export async function referencePayload(ids: string[]) {
  const out: { mimeType: string; data: string }[] = []
  for (const id of ids) {
    const a = await getAsset(id)
    if (!a) continue
    try {
      const bmp = await createImageBitmap(a.blob)
      const k = Math.min(1, 768 / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas')
      c.width = Math.round(bmp.width * k)
      c.height = Math.round(bmp.height * k)
      const g = c.getContext('2d')!
      g.fillStyle = '#fff'
      g.fillRect(0, 0, c.width, c.height)
      g.drawImage(bmp, 0, 0, c.width, c.height)
      bmp.close()
      out.push({ mimeType: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] })
    } catch {
      /* 읽을 수 없는 레퍼런스는 건너뜀 */
    }
  }
  return out
}

/** aiImage 결과(base64) → 첨부용 File */
export function aiImageFile(r: { mimeType: string; data: string }, name: string) {
  const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0))
  const ext = r.mimeType === 'image/jpeg' ? 'jpg' : r.mimeType === 'image/webp' ? 'webp' : 'png'
  return new File([bytes], `${name}.${ext}`, { type: r.mimeType })
}
