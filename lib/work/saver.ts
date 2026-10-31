import { useSyncExternalStore } from 'react'
import { ConflictError, isQuotaError } from './db'

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict'

interface Job {
  run: () => Promise<void>
  timer?: ReturnType<typeof setTimeout>
}

/** 직접 입력 저장 대기열: 700ms 디바운스, 순차 실행, 실패 시 재시도 보관 */
class Saver {
  private pending = new Map<string, Job>()
  private failed = new Map<string, Job>()
  private chain: Promise<void> = Promise.resolve()
  private running = 0
  state: SaveState = 'idle'
  error = ''
  private subs = new Set<() => void>()

  subscribe = (fn: () => void) => {
    this.subs.add(fn)
    return () => this.subs.delete(fn)
  }
  private set(state: SaveState, error = '') {
    this.state = state
    this.error = error
    this.subs.forEach((f) => f())
  }
  get dirty() {
    return this.pending.size > 0 || this.failed.size > 0 || this.running > 0
  }

  schedule(key: string, run: () => Promise<void>, delay = 700) {
    const prev = this.pending.get(key)
    if (prev?.timer) clearTimeout(prev.timer)
    this.failed.delete(key)
    const job: Job = { run }
    job.timer = setTimeout(() => this.exec(key), delay)
    this.pending.set(key, job)
    if (this.state !== 'error' && this.state !== 'conflict') this.set('pending')
  }

  /** 즉시 실행하는 저장(버튼 동작 등). 결과를 기다릴 수 있다. */
  now<T>(run: () => Promise<T>): Promise<T> {
    let out!: T
    const p = this.enqueue(async () => {
      out = await run()
    })
    return p.then(() => out)
  }

  private enqueue(fn: () => Promise<void>) {
    this.running++
    this.set('saving')
    const p = this.chain.then(fn)
    this.chain = p.catch(() => {})
    return p.then(
      () => {
        this.running--
        if (!this.dirty) this.set('saved')
      },
      (e) => {
        this.running--
        this.fail(e)
        throw e
      },
    )
  }

  private fail(e: unknown) {
    if (e instanceof ConflictError) this.set('conflict', e.message)
    else if (isQuotaError(e)) this.set('error', '브라우저 저장 공간이 부족해요. 백업을 내려받고 사용하지 않는 첨부를 정리해 주세요. 입력 내용은 화면에 남아 있습니다.')
    else this.set('error', e instanceof Error ? e.message : String(e))
  }

  private exec(key: string) {
    const job = this.pending.get(key)
    if (!job) return Promise.resolve()
    if (job.timer) clearTimeout(job.timer)
    this.pending.delete(key)
    return this.enqueue(job.run).catch(() => {
      this.failed.set(key, { run: job.run })
    })
  }

  /** 대기 중인 저장을 모두 완료 */
  async flush() {
    await Promise.all([...this.pending.keys()].map((k) => this.exec(k)))
    await this.chain
  }

  async retry() {
    const jobs = [...this.failed.entries()]
    this.failed.clear()
    this.set('saving')
    for (const [k, j] of jobs) this.pending.set(k, j)
    await this.flush()
  }

  discardFailed() {
    this.failed.clear()
    if (!this.dirty) this.set('idle')
  }
}

export const saver = new Saver()

export function useSaveState() {
  return useSyncExternalStore(saver.subscribe, () => saver.state, () => 'idle' as SaveState)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (saver.dirty) {
      void saver.flush()
      e.preventDefault()
    }
  })
}
