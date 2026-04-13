import { useEffect, useRef } from 'react'

/**
 * SpaceBackground
 * Fixed canvas behind all UI (z-index: 0).
 * When active (dark mode):  renders twinkling stars + occasional shooting stars.
 * When inactive (light mode): canvas is transparent, stars hidden.
 * Fades in/out via CSS opacity transition (0.45s).
 */
const NUM_STARS = 180
const NUM_DISTANT_STARS = 56

export default function SpaceBackground({ active = true, theme = 'dark' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let rafId
    let time = 0
    let shootingCooldown = randomShootingDelay()
    const shootingStars = []
    const isDark = theme === 'dark'

    // Generate stable star positions once
    const stars = Array.from({ length: NUM_STARS }).map(() => ({
      xRatio: Math.random(),          // stored as ratio so resize preserves positions
      yRatio: Math.random(),
      radius: Math.random() * 1.1 + 0.25,
      baseAlpha: Math.random() * 0.55 + 0.2,
      speed: Math.random() * 0.004 + 0.0008,
      phase: Math.random() * Math.PI * 2,
    }))

    const distantStars = Array.from({ length: NUM_DISTANT_STARS }).map(() => ({
      xRatio: Math.random(),
      yRatio: Math.random(),
      radius: Math.random() * 0.9 + 0.15,
      alpha: Math.random() * 0.22 + 0.04,
    }))

    const planets = [
      {
        xRatio: 0.14,
        yRatio: 0.18,
        radius: 30,
        glow: 0.18,
        colorA: 'rgba(111, 182, 255, 0.22)',
        colorB: 'rgba(63, 122, 232, 0.08)',
      },
      {
        xRatio: 0.86,
        yRatio: 0.82,
        radius: 22,
        glow: 0.12,
        colorA: 'rgba(205, 224, 255, 0.16)',
        colorB: 'rgba(118, 164, 245, 0.06)',
      },
    ]

    const ships = [
      {
        xRatio: 0.72,
        yRatio: 0.24,
        scale: 1,
        opacity: 0.11,
        driftSpeed: 0.00006,
        driftAxis: 'x',
        dir: 1,
      },
      {
        xRatio: 0.26,
        yRatio: 0.74,
        scale: 0.85,
        opacity: 0.08,
        driftSpeed: 0.00005,
        driftAxis: 'y',
        dir: -1,
      },
      {
        xRatio: 0.88,
        yRatio: 0.46,
        scale: 0.72,
        opacity: 0.07,
        driftSpeed: 0.00004,
        driftAxis: 'x',
        dir: -1,
      },
    ]

    function drawShip(cx, cy, scale = 1, opacity = 0.1) {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(scale, scale)
      ctx.globalAlpha = opacity
      ctx.fillStyle = '#dbe8ff'
      ctx.beginPath()
      ctx.moveTo(-18, 3)
      ctx.lineTo(22, 0)
      ctx.lineTo(-7, -7)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = opacity * 0.7
      ctx.fillRect(-10, 3, 18, 2)
      ctx.restore()
    }

    function randomShootingDelay() {
      // 900–1800 frames ≈ 15–30 s at 60 fps
      return Math.floor(900 + Math.random() * 900)
    }

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    function spawnShootingStar() {
      const sx = Math.random() * canvas.width * 0.65
      const sy = Math.random() * canvas.height * 0.35
      const angle = (20 + Math.random() * 20) * (Math.PI / 180)
      const speed = 5 + Math.random() * 4
      shootingStars.push({
        x: sx,
        y: sy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length: 80 + Math.random() * 70,
        alpha: 0.95,
        decay: 0.022,
      })
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (!active) {
        rafId = requestAnimationFrame(draw)
        return
      }

      time++

      if (isDark) {
        // ── Subtle planets ───────────────────────────────────
        planets.forEach((planet) => {
          const px = planet.xRatio * canvas.width
          const py = planet.yRatio * canvas.height
          const r = planet.radius
          const grad = ctx.createRadialGradient(px - r * 0.35, py - r * 0.4, r * 0.2, px, py, r)
          grad.addColorStop(0, planet.colorA)
          grad.addColorStop(1, planet.colorB)

          ctx.save()
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(px, py, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowColor = 'rgba(180, 210, 255, 0.18)'
          ctx.shadowBlur = r * 0.6
          ctx.globalAlpha = planet.glow
          ctx.strokeStyle = 'rgba(214, 232, 255, 0.4)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(px, py, r * 1.05, 0.2, Math.PI - 0.4)
          ctx.stroke()
          ctx.restore()
        })
      }

      // ── Distant star layer ───────────────────────────────
      distantStars.forEach((s) => {
        ctx.save()
        ctx.globalAlpha = isDark ? s.alpha : Math.min(0.24, s.alpha * 0.8)
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(s.xRatio * canvas.width, s.yRatio * canvas.height, s.radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      })

      // ── Twinkling stars ──────────────────────────────────
      stars.forEach((s) => {
        const twinkle = isDark
          ? 0.65 + 0.35 * Math.sin(time * s.speed * 60 + s.phase)
          : 0.75 + 0.25 * Math.sin(time * s.speed * 48 + s.phase)
        ctx.save()
        ctx.globalAlpha = isDark
          ? s.baseAlpha * twinkle
          : Math.min(0.5, s.baseAlpha * 0.85 * twinkle)
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(
          s.xRatio * canvas.width,
          s.yRatio * canvas.height,
          s.radius,
          0,
          Math.PI * 2
        )
        ctx.fill()
        ctx.restore()
      })

      if (isDark) {
        // ── Subtle drifting spaceship silhouettes ────────────
        ships.forEach((ship) => {
          const drift = Math.sin(time * ship.driftSpeed * 60) * 20 * ship.dir
          const shipX = (ship.xRatio * canvas.width) + (ship.driftAxis === 'x' ? drift : 0)
          const shipY = (ship.yRatio * canvas.height) + (ship.driftAxis === 'y' ? drift : 0)
          drawShip(shipX, shipY, ship.scale, ship.opacity)
        })

        // ── Shooting stars ───────────────────────────────────
        shootingCooldown--
        if (shootingCooldown <= 0) {
          spawnShootingStar()
          shootingCooldown = randomShootingDelay()
        }

        for (let i = shootingStars.length - 1; i >= 0; i--) {
          const ss = shootingStars[i]
          ss.x += ss.vx
          ss.y += ss.vy
          ss.alpha -= ss.decay

          if (ss.alpha <= 0) {
            shootingStars.splice(i, 1)
            continue
          }

          const mag = Math.hypot(ss.vx, ss.vy)
          const tailX = ss.x - (ss.vx / mag) * ss.length
          const tailY = ss.y - (ss.vy / mag) * ss.length

          const grad = ctx.createLinearGradient(tailX, tailY, ss.x, ss.y)
          grad.addColorStop(0, 'rgba(255,255,255,0)')
          grad.addColorStop(0.6, `rgba(255,255,255,${ss.alpha * 0.4})`)
          grad.addColorStop(1, `rgba(255,255,255,${ss.alpha})`)

          ctx.save()
          ctx.lineWidth = 1.5
          ctx.strokeStyle = grad
          ctx.globalAlpha = ss.alpha
          ctx.beginPath()
          ctx.moveTo(tailX, tailY)
          ctx.lineTo(ss.x, ss.y)
          ctx.stroke()
          ctx.restore()
        }
      }

      rafId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(rafId)
    }
  }, [active, theme])

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
        zIndex: 0,
        opacity: active ? (theme === 'dark' ? 1 : 0.85) : 0,
        transition: 'opacity 0.45s ease',
      }}
    />
  )
}
