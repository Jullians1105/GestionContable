import { useEffect, useRef, useState } from 'react'

const THRESHOLD = 80  // px to pull before releasing triggers reload
const MAX_PULL  = 120 // max visual travel

export function usePullToRefresh() {
  const [pullY, setPullY]       = useState(0)   // 0-MAX_PULL
  const [releasing, setReleasing] = useState(false)
  const startY = useRef(null)
  const pulling = useRef(false)

  useEffect(() => {
    function onTouchStart(e) {
      if (window.scrollY !== 0) return
      startY.current = e.touches[0].clientY
      pulling.current = false
    }

    function onTouchMove(e) {
      if (startY.current === null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) { startY.current = null; return }
      if (window.scrollY !== 0) { startY.current = null; return }

      pulling.current = true
      // Rubber-band: slow down as you pull further
      const clamped = Math.min(dy * 0.5, MAX_PULL)
      setPullY(clamped)
      if (dy > 10) e.preventDefault()   // prevent native overscroll
    }

    function onTouchEnd() {
      if (!pulling.current) { startY.current = null; return }
      if (pullY >= THRESHOLD) {
        setReleasing(true)
        setTimeout(() => window.location.reload(), 300)
      } else {
        setPullY(0)
      }
      startY.current = null
      pulling.current = false
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove',  onTouchMove,  { passive: false })
    document.addEventListener('touchend',   onTouchEnd,   { passive: true })

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove',  onTouchMove)
      document.removeEventListener('touchend',   onTouchEnd)
    }
  }, [pullY])

  return { pullY, releasing, ready: pullY >= THRESHOLD }
}
