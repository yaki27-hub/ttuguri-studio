'use client'

import { useRef, useState } from 'react'
import { saver, useSaveState } from '@/lib/work/saver'
import { downloadBlob } from '@/lib/work/format'
import { exportBackup, importBackup, readBackup, summarize, type BackupContents, type ConflictPolicy, type ImportMode, type ImportSummary } from '@/lib/work/zip'
import { Modal, Notice } from './ui'

const SAVE_LABEL = {
  idle: '',
  pending: '입력 중…',
  saving: '저장 중…',
  saved: '✓ 저장됨',
  error: '⚠︎ 저장 실패',
  conflict: '⚠︎ 충돌',
}

export function SaveIndicator() {
  const s = useSaveState()
  return (
    <div className={`save-state s-${s}`} role="status" aria-live="polite">
      <span>{SAVE_LABEL[s]}</span>
      {s === 'error' && (
        <button type="button" className="btn small" onClick={() => saver.retry()}>
          다시 저장
        </button>
      )}
    </div>
  )
}

export function BackupButtons({ onRestored }: { onRestored: () => void }) {
  const [importing, setImporting] = useState(false)
  return (
    <div className="row">
      <button
        type="button"
        className="btn"
        onClick={async () => {
          await saver.flush()
          downloadBlob(await exportBackup(), `dduguri-backup-${new Date().toISOString().slice(0, 10)}.zip`)
        }}
      >
        백업 ZIP 내려받기
      </button>
      <button type="button" className="btn" onClick={() => setImporting(true)}>
        백업 가져오기
      </button>
      {importing && <ImportDialog onClose={() => setImporting(false)} onDone={() => (setImporting(false), onRestored())} />}
    </div>
  )
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [contents, setContents] = useState<BackupContents>()
  const [summary, setSummary] = useState<ImportSummary>()
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<ImportMode>('merge')
  const [policy, setPolicy] = useState<ConflictPolicy>('skip')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  return (
    <Modal
      title="백업 가져오기"
      onClose={onClose}
      footer={
        done ? (
          <button type="button" className="btn primary" onClick={onDone}>
            확인
          </button>
        ) : (
          summary && (
            <button
              type="button"
              className="btn primary"
              disabled={busy || (mode === 'replace' && !confirmReplace)}
              onClick={async () => {
                if (!contents) return
                setBusy(true)
                setErr('')
                try {
                  await saver.flush()
                  await importBackup(contents, mode, policy)
                  setDone(true)
                } catch (e) {
                  setErr(`가져오기에 실패했어요. 기존 데이터는 그대로 남아 있습니다. (${(e as Error).message})`)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? '가져오는 중…' : mode === 'replace' ? '전체 교체' : '병합하기'}
            </button>
          )
        )
      }
    >
      {done ? (
        <Notice kind="ok">가져오기를 마쳤어요.</Notice>
      ) : (
        <>
          <p className="hint">이 앱에서 내려받은 복원용 백업 ZIP만 가져올 수 있어요. 게시 패키지 ZIP과는 다릅니다.</p>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            백업 파일 선택
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              setErr('')
              setSummary(undefined)
              try {
                const c = await readBackup(f)
                setContents(c)
                setSummary(await summarize(c))
              } catch (x) {
                setErr((x as Error).message)
              }
            }}
          />
          {err && <Notice kind="error">{err}</Notice>}
          {summary && (
            <div className="stack">
              <Notice>
                에피소드 {summary.episodes}개 · 컷 {summary.panels}개 · 첨부 {summary.assets}개{summary.hasSettings ? ' · 캐릭터 설정 포함' : ''}
                {summary.conflicts > 0 && <> · 현재 데이터와 ID가 겹치는 에피소드 {summary.conflicts}개</>}
              </Notice>
              <fieldset>
                <legend>가져오는 방식</legend>
                <label className="radio">
                  <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} /> 병합 — 현재 데이터에 더하기
                </label>
                <label className="radio">
                  <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> 전체 교체 — 현재 데이터를 모두 지우고 백업으로 바꾸기
                </label>
              </fieldset>
              {mode === 'merge' && summary.conflicts > 0 && (
                <fieldset>
                  <legend>ID가 겹치는 에피소드</legend>
                  <label className="radio">
                    <input type="radio" checked={policy === 'skip'} onChange={() => setPolicy('skip')} /> 건너뛰기 (현재 것 유지)
                  </label>
                  <label className="radio">
                    <input type="radio" checked={policy === 'copy'} onChange={() => setPolicy('copy')} /> 복사본으로 추가
                  </label>
                  <label className="radio">
                    <input type="radio" checked={policy === 'replace'} onChange={() => setPolicy('replace')} /> 백업 것으로 교체
                  </label>
                </fieldset>
              )}
              {mode === 'replace' && (
                <label className="check danger">
                  <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} /> 현재 브라우저의 모든 에피소드·설정·첨부가 지워지는 것을 확인했어요.
                </label>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
