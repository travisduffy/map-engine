import type { AppContext, Feature } from '../lib/feature'

const INTERVAL_SECONDS = 1
const MAX_TICKS_PER_FRAME = 10

/** Fixed-tick game-clock accumulator with pause/speed controls. */
export function createClock(ctx: AppContext): Feature {
  const tickCounterEl = document.getElementById('tick-counter')!
  const clockSpeedEl = document.getElementById('clock-speed')!
  const pauseBtn = document.getElementById('btn-clock-pause')!
  const speedHalfBtn = document.getElementById('btn-clock-speed-half')!
  const speed1Btn = document.getElementById('btn-clock-speed-1')!
  const speed2Btn = document.getElementById('btn-clock-speed-2')!
  const speed5Btn = document.getElementById('btn-clock-speed-5')!
  const ac = new AbortController()

  let speed = 1
  let lastSpeed = 1
  let elapsed = 0
  let accumulator = 0

  const setTicks = (n: number): void => {
    tickCounterEl.textContent = `Ticks: ${n}`
  }
  const setSpeedLabel = (n: number): void => {
    clockSpeedEl.textContent = `Speed: ${n}×`
  }
  const setPauseLabel = (paused: boolean): void => {
    pauseBtn.textContent = paused ? 'Resume' : 'Pause'
  }

  const onFrame = (dt: number): void => {
    if (speed === 0) return

    accumulator += dt * speed
    let ticks = 0
    while (accumulator >= INTERVAL_SECONDS && ticks < MAX_TICKS_PER_FRAME) {
      accumulator -= INTERVAL_SECONDS
      elapsed++
      setTicks(elapsed)
      setSpeedLabel(speed)
      ticks++
    }
    if (ticks === MAX_TICKS_PER_FRAME) {
      accumulator = 0
    }
  }

  const setSpeedValue = (multiplier: number): void => {
    speed = Math.max(0, multiplier)
    if (speed > 0) lastSpeed = speed
    setPauseLabel(false)
    setSpeedLabel(speed)
  }

  return {
    mount() {
      speed = 1
      lastSpeed = 1
      elapsed = 0
      accumulator = 0
      setTicks(0)
      setSpeedLabel(1)
      setPauseLabel(false)

      ctx.engine.onFrame(onFrame)

      pauseBtn.addEventListener(
        'click',
        () => {
          if (speed === 0) {
            speed = lastSpeed
          } else {
            lastSpeed = speed
            speed = 0
          }
          setPauseLabel(speed === 0)
          setSpeedLabel(speed)
        },
        { signal: ac.signal }
      )
      speedHalfBtn.addEventListener('click', () => setSpeedValue(0.5), {
        signal: ac.signal,
      })
      speed1Btn.addEventListener('click', () => setSpeedValue(1), {
        signal: ac.signal,
      })
      speed2Btn.addEventListener('click', () => setSpeedValue(2), {
        signal: ac.signal,
      })
      speed5Btn.addEventListener('click', () => setSpeedValue(5), {
        signal: ac.signal,
      })
    },
    destroy() {
      ctx.engine.offFrame(onFrame)
      ac.abort()
      setTicks(0)
      setSpeedLabel(1)
      setPauseLabel(false)
    },
  }
}
