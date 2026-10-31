'use client'

import { useEffect, useState } from 'react'
import { getSettings } from '@/lib/work/repo'

/** 서버 액션 폼에 현재 캐릭터 설정을 함께 보낸다 (설정 화면에서 고친 내용이 AI 지시문이 됨) */
export default function SettingsInput() {
  const [v, setV] = useState('')
  useEffect(() => {
    getSettings().then((s) => {
      const { referenceAssetIds, ...rest } = s
      setV(JSON.stringify({ ...rest, referenceCount: referenceAssetIds.length }))
    })
  }, [])
  return <input type="hidden" name="settings" value={v} />
}
