import { useEffect, useRef } from 'react'

/**
 * CursorParticleCanvas
 * Renders canvas-based cursor trail particles.
 * Light mode → white snowflakes drifting down.
 * Dark mode  → pale-blue glowing star dots.
 * Only activates on mouse/pointer devices (hover: hover).
 * Uses requestAnimationFrame; capped at 40 particles for performance.
 */
export default function CursorParticleCanvas({ theme }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    // Disable on touch-only devices
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const particles = []
    let frame = 0
    let rafId
    const isDark = theme === 'dark'

    function drawStar(cx, cy, spikes, outerRadius, innerRadius) {
      let rot = Math.PI / 2 * 3
      const step = Math.PI / spikes

      ctx.beginPath()
      ctx.moveTo(cx, cy - outerRadius)
      for (let i = 0; i < spikes; i++) {
        ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius)
        rot += step
        ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius)
        rot += step
      }
      ctx.lineTo(cx, cy - outerRadius)
      ctx.closePath()
    }

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    function spawnParticle(x, y) {
      // Keep at most 40 particles at once
      if (particles.length >= 40) particles.splice(0, 1)
      const brightness = 0.55 + Math.random() * 0.45
      particles.push({
        x,
        y,
        // Slight horizontal drift + downward velocity
        vx: (Math.random() - 0.5) * 1.4,
        vy: Math.random() * 1.3 + 0.4,
        alpha: 0.75 + Math.random() * 0.25,
        decay: 0.016 + Math.random() * 0.012,
        // Light: snowflake glyph; Dark: star particle
        size: isDark ? Math.random() * 2.4 + 1.5 : Math.random() * 3.5 + 3,
        brightness,
        twinkleSpeed: 0.08 + Math.random() * 0.14,
        phase: Math.random() * Math.PI * 2,
      })
    }

    function onMouseMove(e) {
      spawnParticle(e.clientX, e.clientY)
    }
    window.addEventListener('mousemove', onMouseMove)

    function draw() {
      frame += 1
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.alpha -= p.decay

        if (p.alpha <= 0) {
          particles.splice(i, 1)
          continue
        }

        ctx.save()
        ctx.globalAlpha = Math.max(0, p.alpha)

        if (isDark) {
          // Twinkling pale-blue star
          const pulse = 0.45 + ((Math.sin(frame * p.twinkleSpeed + p.phase) + 1) / 2) * 0.55
          const starAlpha = Math.max(0, p.alpha * pulse)
          ctx.globalAlpha = starAlpha
          ctx.shadowColor = `rgba(170, 220, 255, ${0.75 * p.brightness})`
          ctx.shadowBlur = 8 + p.size * 2.4
          ctx.fillStyle = `rgba(225, 245, 255, ${0.72 + p.brightness * 0.28})`
          drawStar(p.x, p.y, 5, p.size * (1.2 + p.brightness * 0.25), p.size * 0.48)
          ctx.fill()
        } else {
          // White snowflake character
          ctx.shadowColor = 'rgba(255, 255, 255, 0.7)'
          ctx.shadowBlur = 5
          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
          ctx.font = `${p.size * 2.2}px serif`
          ctx.textBaseline = 'middle'
          ctx.fillText('❄', p.x - p.size, p.y)
        }

        ctx.restore()
      }

      rafId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(rafId)
    }
  }, [theme])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9998,
      }}
    />
  )
}
