import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'

const API_BASE = '/api'

// ══════════════════════════════════════════════════════════════════
// SCENARIO STATE — Single source of truth for the entire demo.
// Every component subscribes to this. No independent computation.
// All values are derived from this one object.
// ══════════════════════════════════════════════════════════════════
const OPERATORS = [
  { name: 'Rajesh', initials: 'R', specialty: 'Pressure spikes · Valve sequencing', baseRate: 94, exp: 26 },
  { name: 'Priya', initials: 'P', specialty: 'Cooling tower · Gradual ramp', baseRate: 91, exp: 5 },
  { name: 'Kumar', initials: 'K', specialty: 'Pump cavitation · Feed restart', baseRate: 88, exp: 22 },
  { name: 'Suresh', initials: 'S', specialty: 'Compressor · Non-standard restart', baseRate: 85, exp: 18 },
  { name: 'Anita', initials: 'A', specialty: 'Feed pumps · Cascade prevention', baseRate: 82, exp: 14 },
]

const SCENARIO_STATE = {
  normal: {
    label: 'Normal Operations',
    description: 'All systems operating within normal parameters.',
    plantState: { pressure: 2.1, temperature: 62.0, level: 45.0, pump_rpm: 1450 },

    // Historical memory — retrieved incidents
    incidents: [],

    // Operator relevance to THIS scenario (NOT a permanent leaderboard)
    operatorRelevance: {
      Rajesh: 0, Priya: 0, Kumar: 0, Suresh: 0, Anita: 0,
    },
    // Which operator would be most relevant (null = none)
    mostRelevantOperator: null,

    // AI confidence (0–1)
    confidence: 0,

    // What the AI recommends
    recommendedAction: 'MONITORING',
    reason: 'All systems nominal. No intervention required.',

    // SOP validation
    sopReference: null,
    compliance: 'PASS',

    // Escalation
    escalation: false,

    // Which pipeline stage is active (0–5)
    pipelineStage: 0,

    // Discovery Engine — undocumented events surfaced by the system
    discoveryEvents: [],

    // Risk Engine metrics (all 0–100)
    riskMetrics: {
      knowledgeConcentration: 74,
      retirementExposure: 58,
      skillRedundancy: 42,
      memoryHealth: 91,
    },

    // Validation Engine — Agreement Score (0–100)
    agreementScore: 100,

    // Transfer Engine — replay/training content
    replayContent: null,
  },

  pressure_spike: {
    label: 'Known Failure — Pressure Spike',
    description: 'Pressure rises sharply. The Memory Engine retrieves similar historical events. The AI recommends the most likely expert action with high confidence.',
    plantState: { pressure: 3.8, temperature: 71.5, level: 42.0, pump_rpm: 1680 },

    incidents: [
      { year: 'Nov 2019', operator: 'Rajesh', action: 'Closed Valve 7B', desc: 'Isolated downstream, reduced pump, stabilized reactor.', recovery: '14s', outcome: '12 min downtime avoided' },
      { year: 'Mar 2021', operator: 'Priya', action: 'Rerouted coolant', desc: 'Identified cascade risk, prevented full shutdown.', recovery: '22s', outcome: '$340k loss prevented' },
      { year: 'Jun 2023', operator: 'Anita', action: 'Reduced load gradually', desc: 'Recognized compressor surge precursor, avoided trip.', recovery: '31s', outcome: 'Critical asset protected' },
      { year: 'Feb 2024', operator: 'Suresh', action: 'Restarted feed pump', desc: 'Executed non-standard sequence, restored feed.', recovery: '8s', outcome: 'SOP updated' },
    ],

    operatorRelevance: {
      Rajesh: 94, Priya: 31, Kumar: 22, Suresh: 18, Anita: 15,
    },
    mostRelevantOperator: 'Rajesh',

    confidence: 0.94,

    recommendedAction: 'CLOSE VALVE 7B',
    reason: 'Matched 4 similar historical events. Rajesh used this sequence in 3 of 4 cases, achieving recovery in under 14 seconds.',

    sopReference: 'SOP 08.5',
    compliance: 'PASS',

    escalation: false,

    pipelineStage: 5,

    discoveryEvents: [
      { operator: 'Rajesh', type: 'silent_save', desc: 'Closed Valve 7B before interlock trip — undocumented sequence', year: '2019' },
      { operator: 'Anita', type: 'near_miss', desc: 'Pressure oscillation subsided without SOP activation — pattern not in formal records', year: '2023' },
    ],

    riskMetrics: {
      knowledgeConcentration: 78,
      retirementExposure: 68,
      skillRedundancy: 34,
      memoryHealth: 42,
    },

    agreementScore: 92,

    replayContent: {
      title: 'Pressure Spike — Nov 2019',
      steps: [
        'Pressure exceeds 3.5 bar → alarm triggered',
        'Rajesh closes Valve 7B (2.3s)',
        'Downstream pressure stabilizes (5.1s)',
        'Rajesh reduces Pump 2 RPM to 1200 (7.8s)',
        'Reactor temperature normalizes (14.0s)',
      ],
    },
  },

  novel: {
    label: 'Novel Condition',
    description: 'An unfamiliar combination of conditions. No historical precedent exists in the training data. Confidence drops and the system escalates to a human operator.',
    plantState: { pressure: 3.2, temperature: 74.8, level: 38.0, pump_rpm: 1820 },

    incidents: [],

    operatorRelevance: {
      Rajesh: 8, Priya: 5, Kumar: 4, Suresh: 3, Anita: 2,
    },
    mostRelevantOperator: null,

    confidence: 0.37,

    recommendedAction: 'NO PRECEDENT FOUND',
    reason: 'Escalating to Human Operator. The current sensor pattern (pressure oscillation + temperature anomaly) does not match any known condition in the training data.',

    sopReference: null,
    compliance: 'INCONCLUSIVE',

    escalation: true,

    pipelineStage: 1,

    discoveryEvents: [],

    riskMetrics: {
      knowledgeConcentration: 85,
      retirementExposure: 72,
      skillRedundancy: 22,
      memoryHealth: 18,
    },

    agreementScore: 37,

    replayContent: null,
  },
}

// Derive per-operator display data with scenario-specific relevance
function getOperatorDisplay(operator, scenario) {
  const relevance = scenario.operatorRelevance[operator.name]
  return {
    ...operator,
    relevance,
    // Display rate = the relevance percentage (relevant to THIS scenario), fall back to baseRate
    displayRate: relevance || operator.baseRate,
    isActive: scenario.mostRelevantOperator === operator.name,
    isDim: !!scenario.mostRelevantOperator && scenario.mostRelevantOperator !== operator.name,
  }
}

// ══════════════════════════════════════════════════════════════════
// HOOKS
// ══════════════════════════════════════════════════════════════════
function useCountUp(target, duration = 2000) {
  const [value, setValue] = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef(null)
  const frameRef = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) setStarted(true)
    }, { threshold: 0.3 })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [started])
  useEffect(() => {
    if (!started) return
    let startTime
    const animate = (time) => {
      if (!startTime) startTime = time
      const progress = Math.min((time - startTime) / duration, 1)
      setValue(Math.floor(progress * target))
      if (progress < 1) frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [started, target, duration])
  return { value, ref }
}

function useReveal() {
  const [visible, setVisible] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      // Scroll-linked: set visibility based on intersection ratio for continuous effect
      if (entry.isIntersecting) {
        setVisible(true)
      } else if (entry.boundingClientRect.bottom < 0 || entry.boundingClientRect.top > window.innerHeight) {
        // Scrolled past the section in either direction — reset so it can replay
        setVisible(false)
      }
    }, { threshold: [0, 0.05, 0.1, 0.2] })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, className: `reveal${visible ? ' visible' : ''}` }
}

function RevealSection({ children, style }) {
  const { ref, className } = useReveal()
  return <div ref={ref} className={className} style={style}>{children}</div>
}

function Counter({ target, suffix = '', duration, className = '' }) {
  const { value, ref } = useCountUp(target, duration)
  return <span className={className}><span ref={ref}>{value}</span>{suffix}</span>
}

// ══════════════════════════════════════════════════════════════════
// KNOWLEDGE NETWORK
// ══════════════════════════════════════════════════════════════════
function KnowledgeNetwork() {
  const canvasRef = useRef(null)
  const frameRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const resize = () => { canvas.width = canvas.parentElement.clientWidth; canvas.height = canvas.parentElement.clientHeight }
    resize()
    window.addEventListener('resize', resize)
    const nodes = Array.from({ length: 30 }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0002, vy: (Math.random() - 0.5) * 0.0002,
      r: 0.6 + Math.random() * 1.2, o: 0.03 + Math.random() * 0.06, pulse: Math.random() * Math.PI * 2,
    }))
    const animate = (ts) => {
      const w = canvas.width, h = canvas.height
      ctx.clearRect(0, 0, w, h)
      const t = ts * 0.001
      for (const n of nodes) { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > 1) n.vx *= -1; if (n.y < 0 || n.y > 1) n.vy *= -1; n.pulse += 0.01 }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = (nodes[i].x - nodes[j].x) * w, dy = (nodes[i].y - nodes[j].y) * h
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            const o = (1 - dist / 120) * 0.02
            ctx.beginPath(); ctx.strokeStyle = `rgba(212,175,55,${o})`; ctx.lineWidth = 0.3
            ctx.moveTo(nodes[i].x * w, nodes[i].y * h); ctx.lineTo(nodes[j].x * w, nodes[j].y * h); ctx.stroke()
          }
        }
      }
      for (const n of nodes) {
        const pulseO = n.o + Math.sin(t * 0.5 + n.pulse) * n.o * 0.3
        ctx.beginPath(); ctx.arc(n.x * w, n.y * h, n.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(212,175,55,${pulseO})`; ctx.fill()
      }
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => { cancelAnimationFrame(frameRef.current); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.3, borderRadius: 'var(--rad-lg)' }} />
}

// ══════════════════════════════════════════════════════════════════
// PARTICLE BACKGROUND
// ══════════════════════════════════════════════════════════════════
function ParticleBackground() {
  const canvasRef = useRef(null)
  const particlesRef = useRef([])
  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const frameRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', (e) => { mouseRef.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight } })
    particlesRef.current = Array.from({ length: 80 }, (_, i) => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00015, vy: (Math.random() - 0.5) * 0.00015,
      r: 0.4 + Math.random() * 2.4, baseO: 0.06 + Math.random() * 0.18,
      phase: Math.random() * Math.PI * 2, fadeSpeed: 0.003 + Math.random() * 0.008, isGlowing: i % 4 === 0,
    }))
    const animate = (ts) => {
      const w = canvas.width, h = canvas.height
      ctx.clearRect(0, 0, w, h)
      const t = ts * 0.001, mx = mouseRef.current.x, my = mouseRef.current.y
      const particles = particlesRef.current
      for (const p of particles) {
        p.x += p.vx + (mx - 0.5) * p.vx * 3; p.y += p.vy + (my - 0.5) * p.vy * 3
        if (p.x < 0 || p.x > 1) p.vx *= -1; if (p.y < 0 || p.y > 1) p.vy *= -1
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = (particles[i].x - particles[j].x) * w, dy = (particles[i].y - particles[j].y) * h
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 150) {
            const o = (1 - dist / 150) * 0.035
            ctx.beginPath(); ctx.strokeStyle = `rgba(212,175,55,${o})`; ctx.lineWidth = 0.4
            ctx.moveTo(particles[i].x * w, particles[i].y * h); ctx.lineTo(particles[j].x * w, particles[j].y * h); ctx.stroke()
          }
        }
      }
      for (const p of particles) {
        let opacity = p.baseO
        if (p.isGlowing) { opacity = p.baseO + Math.sin(t * p.fadeSpeed * 60 + p.phase) * p.baseO * 0.6; opacity = Math.max(0.02, Math.min(opacity, p.baseO * 1.6)) }
        ctx.beginPath(); ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(212,175,55,${opacity})`; ctx.fill()
        if (p.isGlowing && opacity > p.baseO * 0.8) {
          ctx.beginPath(); ctx.arc(p.x * w, p.y * h, p.r * 2.5, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(212,175,55,${opacity * 0.08})`; ctx.fill()
        }
      }
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [])
  return <canvas ref={canvasRef} className="particle-canvas" />
}

// ══════════════════════════════════════════════════════════════════
// DEMO PARTICLES
// ══════════════════════════════════════════════════════════════════
function DemoParticles() {
  const canvasRef = useRef(null)
  const frameRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const resize = () => { canvas.width = canvas.parentElement.clientWidth; canvas.height = canvas.parentElement.clientHeight }
    resize(); window.addEventListener('resize', resize)
    const ps = Array.from({ length: 40 }, () => ({
      x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.0001, vy: (Math.random() - 0.5) * 0.0001,
      r: 0.3 + Math.random() * 1.5, o: 0.02 + Math.random() * 0.08, p: Math.random() * Math.PI * 2,
    }))
    let t = 0
    const animate = () => {
      t += 0.002; const w = canvas.width, h = canvas.height
      ctx.clearRect(0, 0, w, h)
      for (const p of ps) {
        p.x += p.vx + Math.sin(t + p.p) * 0.0001; p.y += p.vy + Math.cos(t * 0.7 + p.p) * 0.0001
        if (p.x < 0 || p.x > 1) p.vx *= -1; if (p.y < 0 || p.y > 1) p.vy *= -1
        const pulse = p.o + Math.sin(t * 0.8 + p.p) * p.o * 0.3
        ctx.beginPath(); ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(212,175,55,${pulse})`; ctx.fill()
      }
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => { cancelAnimationFrame(frameRef.current); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={canvasRef} className="demo-bg-canvas" />
}

// ══════════════════════════════════════════════════════════════════
// GAUGE — Enhanced radial indicator with depth
// ══════════════════════════════════════════════════════════════════
function EnhancedGauge({ value, max, label, unit = '' }) {
  const r = 20; const circ = 2 * Math.PI * r
  const pct = Math.min(max > 0 ? value / max : 0, 1); const fillLen = pct * circ
  const sev = pct > 0.9 ? 'critical' : pct > 0.6 ? 'warning' : 'normal'
  const displayVal = value != null ? value.toFixed(1).replace(/\.0$/, '') : '—'
  return (
    <div className="eg-gauge">
      <svg viewBox="0 0 46 46" width="46" height="46">
        <circle className="eg-bg" cx="23" cy="23" r={r} />
        <circle className="eg-track" cx="23" cy="23" r={r} strokeDasharray={`${0.75 * circ} ${0.25 * circ}`} />
        <circle className={`eg-fill ${sev}`} cx="23" cy="23" r={r}
          strokeDasharray={`${fillLen * 0.75} ${circ - fillLen * 0.75}`}
          transform="rotate(135 23 23)" />
      </svg>
      <div className={`eg-value ${sev}`}>{displayVal}</div>
      <div className="eg-label">{label}</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// PIPELINE — Reasoning flow with sequenced stages
// ══════════════════════════════════════════════════════════════════
const PIPELINE_STAGES = [
  { label: 'Sensor', icon: '◈' },
  { label: 'Pattern', icon: '◉' },
  { label: 'Expert', icon: '◎' },
  { label: 'SOP', icon: '◆' },
  { label: 'Risk', icon: '◇' },
  { label: 'Rec', icon: '◆' },
]

function ReasoningPipeline({ stage, isNovel, isEscalated }) {
  const activeIdx = Math.max(0, Math.min(stage, 5))
  return (
    <div className={`pipe-flow ${isNovel ? 'novel' : ''}`}>
      {PIPELINE_STAGES.map((s, i) => (
        <div key={i} className={`pipe-stage ${i <= activeIdx ? 'lit' : ''} ${i < activeIdx ? 'done' : ''}`}>
          <div className="pipe-dot">{s.icon}</div>
          <div className="pipe-label">{s.label}</div>
        </div>
      ))}
      <div className="pipe-stream" style={{ width: `${((activeIdx + 0.5) / PIPELINE_STAGES.length) * 100}%`, opacity: activeIdx > 0 ? 0.7 : 0.15 }} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// MEMORY CAPSULE
// ══════════════════════════════════════════════════════════════════
function MemoryCapsule({ event, index }) {
  if (!event) return null
  const colors = ['rgba(212,175,55,0.03)', 'rgba(212,175,55,0.02)', 'rgba(212,175,55,0.04)', 'rgba(212,175,55,0.02)']
  const borderColors = ['rgba(212,175,55,0.06)', 'rgba(212,175,55,0.04)', 'rgba(212,175,55,0.08)', 'rgba(212,175,55,0.04)']
  return (
    <div className="mem-cap" style={{ animationDelay: `${0.1 + index * 0.12}s`, background: colors[index % 4], borderColor: borderColors[index % 4] }}>
      <div className="mem-cap-top">
        <span className="mem-cap-year">{event.year}</span>
        {event.operator && <span className="mem-cap-op">{event.operator}</span>}
        {event.recovery && <span className="mem-cap-rec">{event.recovery}</span>}
      </div>
      <div className="mem-cap-action">{event.action}</div>
      <div className="mem-cap-desc">{event.desc}</div>
      <div className="mem-cap-outcome">{event.outcome}</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// OPERATOR NODE
// ══════════════════════════════════════════════════════════════════
function OperatorNode({ op }) {
  return (
    <div className={`op-node ${op.isActive ? 'active' : ''}`} style={{ opacity: op.isDim ? 0.15 : 1 }}>
      <div className="op-node-avatar">{op.initials}</div>
      <div className="op-node-info">
        <div className="op-node-name">{op.name} <span className="op-node-exp">{op.exp}y</span></div>
        <div className="op-node-spec">{op.specialty}</div>
      </div>
      <div className="op-node-pct">{op.displayRate}%</div>
      {op.isActive && (
        <>
          <div className="op-node-active-ring" />
          <div className="op-memory-particle" />
          <div className="op-memory-particle" style={{ animationDelay: '0.4s' }} />
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// ARCHITECTURE PIPELINE — Animated connected-node Canvas diagram
// Flowing particles between 5 nodes arranged in an S-curve path.
// ══════════════════════════════════════════════════════════════════
const ARCH_NODES = [
  {
    label: 'Data Ingestion', icon: '◈',
    desc: 'SCADA, historians, alarm logs, control commands. All time-aligned and normalized.',
    x: 0.18, y: 0.25,
  },
  {
    label: 'Behavior Learning', icon: '◎',
    desc: 'State-action pairs train a behavioral foundation model. No labels needed.',
    x: 0.50, y: 0.12,
  },
  {
    label: 'Memory Graph', icon: '◉',
    desc: 'Every incident, decision, and outcome becomes a searchable memory node.',
    x: 0.82, y: 0.25,
  },
  {
    label: 'Recommendation Engine', icon: '◆',
    desc: 'Live inference with confidence scoring and uncertainty estimation.',
    x: 0.72, y: 0.68,
  },
  {
    label: 'Expert Replay', icon: '◇',
    desc: 'Full historical recall. Ask what happened before — get the answer instantly.',
    x: 0.28, y: 0.78,
  },
]

function ArchitecturePipeline() {
  const canvasRef = useRef(null)
  const frameRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
    }
    resize()
    window.addEventListener('resize', resize)

    // 4 connection paths between 5 nodes (0→1, 1→2, 2→3, 3→4)
    const edges = [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
    ]

    // Compute bezier control points for each edge based on node layout
    function getEdgePath(from, to) {
      const dx = to.x - from.x
      const dy = to.y - from.y
      const len = Math.sqrt(dx * dx + dy * dy)
      // Control point offset perpendicular to direction for curve
      const mx = (from.x + to.x) / 2
      const my = (from.y + to.y) / 2
      const perpX = -dy / len * 0.15
      const perpY = dx / len * 0.15
      return {
        cp1x: (from.x * 0.5 + mx * 0.5) + perpX,
        cp1y: (from.y * 0.5 + my * 0.5) + perpY,
        cp2x: (to.x * 0.5 + mx * 0.5) + perpX,
        cp2y: (to.y * 0.5 + my * 0.5) + perpY,
      }
    }

    // Cubid bezier point at parameter t
    function bezierPoint(p0, p1, p2, p3, t) {
      const mt = 1 - t
      return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
    }

    // Particles traveling along edges
    const particles = Array.from({ length: 16 }, (_, i) => ({
      edgeIndex: i % 4,
      t: Math.random(),
      speed: 0.0015 + Math.random() * 0.0035,
      size: 1.2 + Math.random() * 1.8,
      baseO: 0.15 + Math.random() * 0.4,
      phase: Math.random() * Math.PI * 2,
      isGlow: Math.random() > 0.65,
    }))

    const animate = (ts) => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      // Convert node positions to pixels
      const positions = ARCH_NODES.map((n) => ({
        x: n.x * w,
        y: n.y * h,
      }))

      const t = ts * 0.001

      // Recalculate path control points per frame (responsive)
      const edgePaths = edges.map((e) => {
        const from = positions[e.from]
        const to = positions[e.to]
        const fromPct = ARCH_NODES[e.from]
        const toPct = ARCH_NODES[e.to]
        return getEdgePath(fromPct, toPct)
      })

      // Draw flowing connection streams (layered: background glow + thin line + dashed)
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i]
        const from = positions[e.from]
        const to = positions[e.to]
        const cp = edgePaths[i]
        const cp1x = cp.cp1x * w
        const cp1y = cp.cp1y * h
        const cp2x = cp.cp2x * w
        const cp2y = cp.cp2y * h

        // Background glow line
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, to.x, to.y)
        ctx.strokeStyle = 'rgba(212,175,55,0.008)'
        ctx.lineWidth = 8
        ctx.stroke()

        // Main connection line
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, to.x, to.y)
        ctx.strokeStyle = 'rgba(212,175,55,0.04)'
        ctx.lineWidth = 0.5
        ctx.stroke()

        // Flowing dashed stream
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, to.x, to.y)
        ctx.setLineDash([1.5, 10])
        ctx.strokeStyle = `rgba(212,175,55,${0.025 + Math.sin(t * 0.3 + i * 0.8) * 0.015})`
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Update and draw flowing particles
      for (const p of particles) {
        p.t += p.speed
        if (p.t > 1) {
          p.t = 0
          p.edgeIndex = (p.edgeIndex + 1) % 4
        }

        const edge = edges[p.edgeIndex]
        const fromNode = ARCH_NODES[edge.from]
        const toNode = ARCH_NODES[edge.to]
        const cp = edgePaths[p.edgeIndex]

        const fromX = fromNode.x * w
        const fromY = fromNode.y * h
        const toX = toNode.x * w
        const toY = toNode.y * h
        const cp1x = cp.cp1x * w
        const cp1y = cp.cp1y * h
        const cp2x = cp.cp2x * w
        const cp2y = cp.cp2y * h

        const px = bezierPoint(fromX, cp1x, cp2x, toX, p.t)
        const py = bezierPoint(fromY, cp1y, cp2y, toY, p.t)

        // Fade at both ends
        const fade = Math.min(p.t / 0.15, (1 - p.t) / 0.15, 1)
        const opacity = p.baseO * fade * (0.7 + 0.3 * Math.sin(t * 0.5 + p.phase))

        ctx.beginPath()
        ctx.arc(px, py, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(212,175,55,${opacity})`
        ctx.fill()

        // Glow on larger particles
        if (p.isGlow && opacity > 0.1) {
          ctx.beginPath()
          ctx.arc(px, py, p.size * 3, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(212,175,55,${opacity * 0.06})`
          ctx.fill()
        }
      }

      // Draw subtle connector node dots at each position
      for (let i = 0; i < positions.length; i++) {
        const pulse = Math.sin(t * 0.4 + i * 1.2) * 0.3 + 0.7
        ctx.beginPath()
        ctx.arc(positions[i].x, positions[i].y, 2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(212,175,55,${0.03 * pulse})`
        ctx.fill()
      }

      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(frameRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className="arch-pipeline-wrap">
      <canvas ref={canvasRef} className="arch-pipeline-canvas" />
      <div className="arch-nodes-container">
        {ARCH_NODES.map((node, i) => (
          <div
            key={i}
            className="arch-node"
            style={{ left: `${node.x * 100}%`, top: `${node.y * 100}%` }}
          >
            <div className="arch-node-inner">
              <div className="arch-node-icon">{node.icon}</div>
              <div className="arch-node-label">{node.label}</div>
              <div className="arch-node-index">0{i + 1}</div>
            </div>
            <div className="arch-node-desc">{node.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// DISCOVERY EVENT CARD
// ══════════════════════════════════════════════════════════════════
function DiscoveryEvent({ event, index }) {
  const typeIcon = event.type === 'silent_save' ? '◉' : event.type === 'near_miss' ? '◘' : '◆'
  return (
    <div className="disc-event" style={{ animationDelay: `${0.1 + index * 0.15}s` }}>
      <span className="disc-icon">{typeIcon}</span>
      <span className="disc-desc">{event.desc}</span>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// INTERACTIVE DEMO — Driven entirely by SCENARIO_STATE
// ══════════════════════════════════════════════════════════════════
function InteractiveDemo() {
  const [activeScenario, setActiveScenario] = useState('normal')
  const [phase, setPhase] = useState('idle')
  const [plantState, setPlantState] = useState(null)
  const [trace, setTrace] = useState(null)
  const mounted = useRef(true)
  const timers = useRef([])

  const fetchStep = useCallback(async () => {
    if (!mounted.current) return
    try {
      const res = await fetch(`${API_BASE}/plant/step`)
      if (res.ok) {
        const data = await res.json()
        if (!mounted.current) return
        setPlantState(data.state)
        setTrace(data.trace)
      }
    } catch (e) { /* ignore */ }
  }, [])

  const changeScenario = useCallback(async (name) => {
    timers.current.forEach(t => clearTimeout(t))
    timers.current = []
    setActiveScenario(name)
    setPhase('thinking')
    setTrace(null)
    setPlantState(null) // Clear stale data immediately
    try { await fetch(`${API_BASE}/plant/scenario/${name}`) }
    catch (e) { await fetch(`${API_BASE}/plant/reset`) }
    await fetchStep()
    if (!mounted.current) return
    // Phase 3: Sequenced reveal — pipeline lights up stage by stage
    const t1 = setTimeout(() => { if (mounted.current) setPhase('sensors') }, 200)
    const t2 = setTimeout(() => { if (mounted.current) setPhase('pipeline') }, 500)
    const t3 = setTimeout(() => { if (mounted.current) setPhase('recommendation') }, 900)
    const t4 = setTimeout(() => { if (mounted.current) setPhase('complete') }, 1400)
    timers.current = [t1, t2, t3, t4]
  }, [fetchStep])

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; timers.current.forEach(t => clearTimeout(t)) } }, [])
  useEffect(() => { changeScenario('normal') }, [])

  // ── Everything comes from SCENARIO_STATE ──
  const scenario = SCENARIO_STATE[activeScenario] || SCENARIO_STATE.normal
  const apiConf = trace?.expert?.confidence
  const effectiveConf = apiConf != null ? apiConf : scenario.confidence
  const apiAction = trace?.expert?.recommended_action
  const apiReason = trace?.expert?.reason
  const effectiveAction = apiAction ? (apiAction === 'no_action' ? 'ALL CLEAR' : apiAction.replace(/_/g, ' ').toUpperCase()) : scenario.recommendedAction
  const effectiveReason = apiReason || scenario.reason
  const isEscalated = trace?.final?.action === 'ESCALATE_TO_SENIOR' || scenario.escalation
  const isNovel = activeScenario === 'novel'
  const idle = phase === 'idle' || phase === 'thinking'

  // Derive pipeline stage from phase for the sequenced reveal
  let pipelineStage = scenario.pipelineStage
  if (phase === 'idle' || phase === 'thinking') pipelineStage = 0
  else if (phase === 'sensors') pipelineStage = 1
  else if (phase === 'pipeline') pipelineStage = 3
  else if (phase === 'recommendation') pipelineStage = 5

  // Interpolate confidence for smooth ring animation during sequenced reveal
  const displayConf = idle ? 0
    : phase === 'sensors' ? Math.min(effectiveConf, 0.35)
    : phase === 'pipeline' ? Math.min(effectiveConf, 0.65)
    : effectiveConf
  const confClass = isEscalated ? 'low' : isNovel ? 'novel' : displayConf >= 0.85 ? 'high' : displayConf >= 0.6 ? 'medium' : 'low'

  // Operator display — derived from scenario state, not hardcoded
  const operators = OPERATORS.map(op => getOperatorDisplay(op, scenario))

  // Match count = incidents.length (always consistent)
  const matchCount = scenario.incidents.length
  const displaySOP = scenario.sopReference ? scenario.sopReference.replace('sop_', '').split('_').slice(0, 2).join('.') : '—'

  // Risk display
  const risk = scenario.riskMetrics

  return (
    <section className="demo-section" id="demo">
      <div className="demo-inner" style={{ position: 'relative' }}>
        <DemoParticles />
        {isNovel && phase === 'complete' && <div className="demo-novel-overlay" />}

        <RevealSection>
          <div className="demo-intro">
            <div className="section-label">Interactive Demo</div>
            <h2 className="section-title">Watch the <span className="gold">memory engine</span> reason</h2>
            <p className="section-sub" style={{ margin: '0 auto' }}>
              {scenario.description}
            </p>
          </div>
        </RevealSection>

        <RevealSection>
          <div className="demo-spatial">
            {/* ── Center: AI Memory Core ── */}
            <div className="sc-core">
              <div className="sc-rings">
                <div className="sc-ring-outer" />
                <div className="sc-ring-mid" />
                <div className={`sc-ring-inner ${isNovel ? 'novel' : ''}`} />
              </div>
              <div className={`sc-pulse ${idle ? 'paused' : ''}`} />                <div className={`sc-sphere ${isNovel ? 'novel' : ''}`}>
                <div className="sc-label">AI Recommendation</div>
                <svg className="sc-conf-ring" viewBox="0 0 52 52" width="48" height="48">
                  <circle className="sc-conf-bg" cx="26" cy="26" r={24} />
                  <circle className={`sc-conf-fill ${isNovel ? 'novel' : confClass}`} cx="26" cy="26" r={24}
                    strokeDasharray={`${isNovel ? 6 : displayConf * 2 * Math.PI * 24} ${isNovel ? 46 : 2 * Math.PI * 24 - displayConf * 2 * Math.PI * 24}`} />
                </svg>
                <div className={`sc-conf-pct ${isNovel ? 'rose' : confClass}`}>
                  {idle ? '—' : `${Math.round(displayConf * 100)}%`}
                </div>
                <div className={`sc-action ${idle ? 'idle' : ''} ${isEscalated ? 'escalated' : ''}`}>
                  {idle ? 'MONITORING' : effectiveAction}
                </div>
                <div className={`sc-reason ${idle ? 'idle' : ''}`}>{idle ? 'Awaiting input\u2026' : effectiveReason}</div>
              </div>

              {/* Stats below core — restored and enlarged */}
              <div className="sc-stats">
                <div className="sc-stat">
                  <span className="sc-stat-val">{matchCount}</span>
                  <span className="sc-stat-lbl">Matches</span>
                </div>
                <div className="sc-stat">
                  <span className="sc-stat-val">{displaySOP}</span>
                  <span className="sc-stat-lbl">SOP</span>
                </div>
                <div className="sc-stat">
                  <span className={`sc-stat-val ${idle ? 'dim' : isEscalated ? 'rose' : scenario.compliance === 'PASS' ? 'green' : 'amber'}`}>
                    {idle ? '—' : scenario.compliance}
                  </span>
                  <span className="sc-stat-lbl">Compliance</span>
                </div>
                <div className="sc-stat">
                  <span className="sc-stat-val amber">{scenario.agreementScore}%</span>
                  <span className="sc-stat-lbl">Agreement</span>
                </div>
              </div>
              {phase === 'thinking' && (
                <div className="sc-think"><div className="sc-think-dot" /><div className="sc-think-dot" /><div className="sc-think-dot" /></div>
              )}
            </div>

            {/* ── Floating Gauges ── */}
            <div className="sc-float-group sc-float-gauges">
              <div className="sc-float-label">Plant State</div>
              <div className="eg-grid">
                <EnhancedGauge value={plantState?.pressure ?? scenario.plantState.pressure} max={4} label="Press" />
                <EnhancedGauge value={plantState?.temperature ?? scenario.plantState.temperature} max={80} label="Temp" />
                <EnhancedGauge value={plantState?.level ?? scenario.plantState.level} max={100} label="Level" />
                <EnhancedGauge value={plantState?.pump_rpm ?? scenario.plantState.pump_rpm} max={2000} label="Pump" />
              </div>
            </div>

            {/* ── Floating Operators ── */}
            <div className="sc-float-group sc-float-operators">
              <div className="sc-float-label">Operator Memory</div>
              {operators.map(op => <OperatorNode key={op.name} op={op} />)}
            </div>

            {/* ── Connection Lines ── */}
            <svg className="sc-conn" viewBox="0 0 100 100" preserveAspectRatio="none">
              <g className={isNovel && phase === 'complete' ? 'sc-conn-fade' : ''}>
                <path className="sc-conn-path" d="M 50 42 C 38 42, 22 38, 16 34" />
                <path className="sc-conn-path" d="M 50 42 C 62 42, 78 38, 84 34" />
                <path className="sc-conn-path" d="M 50 60 C 50 70, 30 76, 16 80" />
                <path className="sc-conn-path" d="M 50 60 C 50 70, 70 76, 84 80" />
              </g>
            </svg>
          </div>

          {/* ── Engine Status Row (Phase 4: Five Engines) ── */}
          <div className="engine-row">
            <div className={`engine-badge memory ${pipelineStage >= 1 ? 'active' : ''}`}>
              <span className="engine-icon">◉</span> Memory
            </div>
            <div className="engine-arrow">→</div>
            <div className={`engine-badge discovery ${pipelineStage >= 2 ? 'active' : ''}`}>
              <span className="engine-icon">◘</span> Discovery
            </div>
            <div className="engine-arrow">→</div>
            <div className={`engine-badge validation ${pipelineStage >= 3 ? 'active' : ''}`}>
              <span className="engine-icon">◆</span> Validation
            </div>
            <div className="engine-arrow">→</div>
            <div className={`engine-badge risk ${pipelineStage >= 4 ? 'active' : ''}`}>
              <span className="engine-icon">◇</span> Risk
            </div>
            <div className="engine-arrow">→</div>
            <div className={`engine-badge transfer ${pipelineStage >= 5 ? 'active' : ''}`}>
              <span className="engine-icon">◆</span> Transfer
            </div>
          </div>

          {/* ── Key Metrics Row (from Risk Engine + Validation Engine) ── */}
          <div className="metrics-row">
            <div className="metrics-item">
              <span className="metrics-val">{risk.knowledgeConcentration}%</span>
              <span className="metrics-lbl">Knowledge Concentration Risk</span>
            </div>
            <div className="metrics-item">
              <span className="metrics-val">{risk.retirementExposure}%</span>
              <span className="metrics-lbl">Retirement Exposure</span>
            </div>
            <div className="metrics-item">
              <span className="metrics-val">{risk.skillRedundancy}%</span>
              <span className="metrics-lbl">Skill Redundancy</span>
            </div>
            <div className="metrics-item">
              <span className="metrics-val" style={{ color: risk.memoryHealth > 60 ? 'var(--green-signal)' : 'var(--amber-signal)' }}>{risk.memoryHealth}%</span>
              <span className="metrics-lbl">Memory Health</span>
            </div>
            <div className="metrics-item">
              <span className="metrics-val">{scenario.agreementScore}%</span>
              <span className="metrics-lbl">Agreement Score</span>
            </div>
          </div>

          {/* ── Bottom Row: Pipeline + Timeline ── */}
          <div className="demo-bottom-new">
            <div className="demo-pipe-section">
              <div className="demo-pipe-header">Reasoning Pipeline</div>
              <ReasoningPipeline stage={pipelineStage} isNovel={isNovel && phase === 'complete'} isEscalated={isEscalated} />
            </div>
            <div className="demo-mem-section">
              <div className="demo-mem-header">Historical Memory <span className="mem-count">{matchCount} events</span></div>
              <div className="demo-mem-list">
                {matchCount === 0 ? (
                  <div className="mem-empty">
                    {isNovel ? 'No historical precedent found.' : 'No incidents recorded.'}
                  </div>
                ) : (
                  scenario.incidents.map((h, i) => <MemoryCapsule key={i} event={h} index={i} />)
                )}
              </div>
            </div>
          </div>

          {/* ── Discovery Events ── */}
          {scenario.discoveryEvents.length > 0 && (
            <div className="discovery-row">
              <div className="discovery-header">
                <span className="disc-label">Discovery Engine</span>
                <span className="disc-sub">{scenario.discoveryEvents.length} undocumented {scenario.discoveryEvents.length === 1 ? 'event' : 'events'} surfaced</span>
              </div>
              <div className="discovery-list">
                {scenario.discoveryEvents.map((d, i) => <DiscoveryEvent key={i} event={d} index={i} />)}
              </div>
            </div>
          )}

          {/* ── Scenario Controls ── */}
          <div className="sc-controls">
            <div className="sc-controls-label">Scenario</div>
            <div className="sc-controls-btns">
              <button type="button" className={`sc-btn ${activeScenario === 'normal' ? 'active' : ''}`} onClick={() => changeScenario('normal')}>Normal</button>
              <button type="button" className={`sc-btn spike ${activeScenario === 'pressure_spike' ? 'active' : ''}`} onClick={() => changeScenario('pressure_spike')}>Known Failure</button>
              <button type="button" className={`sc-btn novel-btn ${activeScenario === 'novel' ? 'active' : ''}`} onClick={() => changeScenario('novel')}>Novel Condition</button>
            </div>
          </div>
        </RevealSection>
      </div>
    </section>
  )
}

// ══════════════════════════════════════════════════════════════════
// MAIN DASHBOARD — Unchanged sections preserved exactly
// ══════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [connected, setConnected] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [loading, setLoading] = useState(true)
  const discoveryRef = useReveal()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const check = async () => {
      try { const res = await fetch(`${API_BASE}/health`); setConnected(res.ok) }
      catch (e) { setConnected(false) }
      setLoading(false)
    }
    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [])

  const heroCounters = [
    { target: 94, suffix: '%', label: 'Knowledge retained' },
    { target: 78, suffix: '%', label: 'Retirement risk exposed' },
    { target: 62, suffix: '%', label: 'Training time reduced' },
    { target: 3, suffix: 'x', label: 'Faster decision transfer' },
  ]

  if (loading) return (
    <div className="loading-screen">
      <div className="loading-ring" />
      <div className="loading-text">OperatorDNA</div>
    </div>
  )

  return (
    <div className="app">
      <ParticleBackground />

      <nav className={`nav${scrolled ? ' scrolled' : ''}`}>
        <div className="nav-left">
          <div className="nav-logo">Operator<span>DNA</span></div>
          <ul className="nav-links">
            <a onClick={() => document.getElementById('problem')?.scrollIntoView({ behavior: 'smooth' })}>Problem</a>
            <a onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>How it works</a>
            <a onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}>Demo</a>
            <a onClick={() => document.getElementById('value')?.scrollIntoView({ behavior: 'smooth' })}>Value</a>
            <a onClick={() => document.getElementById('architecture')?.scrollIntoView({ behavior: 'smooth' })}>Architecture</a>
          </ul>
        </div>
        <div className="nav-right">
          <span className={`nav-dot ${connected ? 'on' : 'off'}`} />
          {connected ? 'Plant Connected' : 'Offline'}
        </div>
      </nav>

      <section className="hero">
        <div className="hero-aurora" />
        <div className="hero-eyebrow">OperatorDNA · Industrial Memory Platform</div>
        <h1 className="hero-title">
          Industrial Memory.<br />
          <span className="gold">Captured Forever.</span>
        </h1>
        <p className="hero-subtitle">
          The first platform that learns from expert operators, preserves their decision patterns,
          and never lets critical knowledge retire.
        </p>
        <div className="hero-actions">
          <button type="button" className="hero-btn primary" onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}>
            See the demo
          </button>
          <button type="button" className="hero-btn secondary">Watch overview</button>
        </div>
        <div className="hero-stats">
          {heroCounters.map((c, i) => (
            <div key={i} className="hero-stat">
              <div className="hero-stat-value gold">
                <Counter target={c.target} suffix={c.suffix} className="hero-stat-value gold" />
              </div>
              <div className="hero-stat-label">{c.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="problem-section" id="problem">
        <div className="problem-inner">
          <RevealSection>
            <div className="problem-grid">
              <div>
                <div className="section-label">The Problem</div>
                <h2 className="section-title" style={{ marginBottom: 16 }}>
                  Every plant has a <span className="gold">Rajesh.</span><br />
                  When he leaves, his knowledge leaves.
                </h2>
                <p className="section-sub" style={{ maxWidth: '100%' }}>
                  Industrial operators with 20–40 years of experience possess knowledge that
                  no manual captures. They know which valve to close, which sequence to follow,
                  and when to deviate from the SOP. When they retire, that expertise disappears.
                </p>
              </div>
              <div className="problem-visual">
                <div className="problem-visual-content">
                  <div className="problem-persona">
                    <div className="problem-avatar">R</div>
                    <div className="problem-persona-name">Rajesh</div>
                    <div className="problem-persona-role">26 years · Senior Operator</div>
                    <div className="problem-arrow">↓</div>
                  </div>
                  <div className="problem-persona empty">
                    <div className="problem-avatar">?</div>
                    <div className="problem-persona-name">Knowledge Lost</div>
                    <div className="problem-persona-role">No successor trained</div>
                  </div>
                </div>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ── HOW IT WORKS — True pinned scroll sequence with stage-specific visuals ── */}
      <section className="hiw-section" id="how-it-works">
        <RevealSection>
          <div className="hiw-intro">
            <div className="section-label" style={{ textAlign: 'center' }}>How It Works</div>
            <h2 className="section-title" style={{ textAlign: 'center', marginBottom: 0 }}>
              From <span className="gold">observing</span> to <span className="gold">preserving</span>
            </h2>
          </div>
        </RevealSection>
        <div className="hiw-scroll-wrap">
          <div className="hiw-scroll-sticky">
            {[
              {
                label: 'Observe', verb: 'Ingests',
                visual: '◈', visualClass: 'obs',
                desc: 'Years of sensor readings, control commands, alarm logs, and operator actions flow into the system from plant historians and SCADA archives.',
              },
              {
                label: 'Learn', verb: 'Trains',
                visual: '◎', visualClass: 'lrn',
                desc: 'A behavioral foundation model maps plant state to expert decisions. Not what failed — what Rajesh did next.',
              },
              {
                label: 'Reason', verb: 'Matches',
                visual: '◉', visualClass: 'rsn',
                desc: 'When a new condition arises, thousands of historical expert responses are weighted by similarity to build a recommendation.',
              },
              {
                label: 'Explain', verb: 'Validates',
                visual: '◆', visualClass: 'exp',
                desc: 'Every recommendation is transparent: matched events, confidence scores, SOP references, and the complete reasoning chain.',
              },
              {
                label: 'Preserve', verb: 'Secures',
                visual: '◇', visualClass: 'prs',
                desc: 'Expert decision patterns become permanent institutional memory. Retirement no longer means knowledge loss.',
              },
            ].map((item, i) => (
              <div key={i} className={`hiw-stage hiw-${item.visualClass}`}>
                <div className="hiw-stage-inner">
                  <div className={`hiw-visual-area ${item.visualClass}`}>
                    <div className="hiw-visual-rays" />
                    {item.visualClass === 'obs' && (
                      <svg className="hiw-svg-ill" viewBox="0 0 200 140" fill="none">
                        <rect x="20" y="20" width="160" height="100" rx="6" stroke="rgba(212,175,55,0.06)" strokeWidth="0.5" />
                        <rect x="26" y="26" width="148" height="88" rx="4" fill="rgba(212,175,55,0.008)" />
                        <line x1="30" y1="45" x2="170" y2="45" stroke="rgba(212,175,55,0.015)" strokeWidth="0.5" />
                        <line x1="30" y1="60" x2="170" y2="60" stroke="rgba(212,175,55,0.015)" strokeWidth="0.5" />
                        <line x1="30" y1="75" x2="170" y2="75" stroke="rgba(212,175,55,0.015)" strokeWidth="0.5" />
                        <line x1="30" y1="90" x2="170" y2="90" stroke="rgba(212,175,55,0.015)" strokeWidth="0.5" />
                        <rect x="30" y="37" width="40" height="5" rx="2" fill="rgba(212,175,55,0.06)" className="hiw-svg-pulse" />
                        <rect x="95" y="52" width="28" height="5" rx="2" fill="rgba(212,175,55,0.04)" className="hiw-svg-pulse" style={{ animationDelay: '0.3s' }} />
                        <rect x="60" y="67" width="35" height="5" rx="2" fill="rgba(212,175,55,0.05)" className="hiw-svg-pulse" style={{ animationDelay: '0.6s' }} />
                        <rect x="80" y="82" width="50" height="5" rx="2" fill="rgba(212,175,55,0.03)" className="hiw-svg-pulse" style={{ animationDelay: '0.9s' }} />
                        <circle cx="40" cy="42" r="2" fill="rgba(212,175,55,0.06)"><animate attributeName="opacity" values="0.06;0.3;0.06" dur="2s" repeatCount="indefinite" /></circle>
                        <circle cx="110" cy="57" r="2" fill="rgba(212,175,55,0.05)"><animate attributeName="opacity" values="0.05;0.25;0.05" dur="2.5s" begin="0.3s" repeatCount="indefinite" /></circle>
                        <circle cx="75" cy="72" r="2" fill="rgba(212,175,55,0.04)"><animate attributeName="opacity" values="0.04;0.2;0.04" dur="1.8s" begin="0.6s" repeatCount="indefinite" /></circle>
                        <circle cx="105" cy="87" r="2" fill="rgba(212,175,55,0.05)"><animate attributeName="opacity" values="0.05;0.3;0.05" dur="2.2s" begin="0.9s" repeatCount="indefinite" /></circle>
                        <path d="M28 100 L172 100" stroke="rgba(212,175,55,0.008)" strokeWidth="0.5" strokeDasharray="2 3" />
                      </svg>
                    )}
                    {item.visualClass === 'lrn' && (
                      <svg className="hiw-svg-ill" viewBox="0 0 200 140" fill="none">
                        <circle cx="50" cy="35" r="12" stroke="rgba(212,175,55,0.04)" strokeWidth="0.5" className="hiw-svg-node" />
                        <circle cx="50" cy="35" r="3" fill="rgba(212,175,55,0.06)"><animate attributeName="r" values="3;4;3" dur="3s" repeatCount="indefinite" /></circle>
                        <circle cx="120" cy="30" r="12" stroke="rgba(212,175,55,0.035)" strokeWidth="0.5" className="hiw-svg-node" />
                        <circle cx="120" cy="30" r="2.5" fill="rgba(212,175,55,0.05)"><animate attributeName="r" values="2.5;3.5;2.5" dur="3.5s" begin="0.5s" repeatCount="indefinite" /></circle>
                        <circle cx="85" cy="65" r="14" stroke="rgba(212,175,55,0.05)" strokeWidth="0.5" className="hiw-svg-node" />
                        <circle cx="85" cy="65" r="3.5" fill="rgba(212,175,55,0.08)"><animate attributeName="r" values="3.5;5;3.5" dur="2.5s" begin="1s" repeatCount="indefinite" /></circle>
                        <circle cx="145" cy="70" r="10" stroke="rgba(212,175,55,0.03)" strokeWidth="0.5" className="hiw-svg-node" />
                        <circle cx="145" cy="70" r="2" fill="rgba(212,175,55,0.04)"><animate attributeName="r" values="2;3;2" dur="4s" begin="0.8s" repeatCount="indefinite" /></circle>
                        <circle cx="160" cy="45" r="8" stroke="rgba(212,175,55,0.025)" strokeWidth="0.5" className="hiw-svg-node" />
                        <circle cx="160" cy="45" r="1.5" fill="rgba(212,175,55,0.035)"><animate attributeName="r" values="1.5;2.5;1.5" dur="3s" begin="1.5s" repeatCount="indefinite" /></circle>
                        <circle cx="35" cy="80" r="9" stroke="rgba(212,175,55,0.028)" strokeWidth="0.5" className="hiw-svg-node" />
                        <circle cx="35" cy="80" r="2" fill="rgba(212,175,55,0.04)"><animate attributeName="r" values="2;3;2" dur="3.2s" begin="0.2s" repeatCount="indefinite" /></circle>
                        <circle cx="115" cy="100" r="11" stroke="rgba(212,175,55,0.032)" strokeWidth="0.5" className="hiw-svg-node" />
                        <circle cx="115" cy="100" r="2.5" fill="rgba(212,175,55,0.05)"><animate attributeName="r" values="2.5;3.5;2.5" dur="2.8s" begin="1.2s" repeatCount="indefinite" /></circle>
                        <line x1="58" y1="42" x2="80" y2="58" stroke="rgba(212,175,55,0.01)" strokeWidth="0.3" className="hiw-svg-conn" />
                        <line x1="96" y1="58" x2="138" y2="62" stroke="rgba(212,175,55,0.01)" strokeWidth="0.3" className="hiw-svg-conn" />
                        <line x1="50" y1="47" x2="42" y2="73" stroke="rgba(212,175,55,0.008)" strokeWidth="0.3" className="hiw-svg-conn" />
                        <line x1="132" y1="70" x2="152" y2="52" stroke="rgba(212,175,55,0.008)" strokeWidth="0.3" className="hiw-svg-conn" />
                        <line x1="92" y1="79" x2="110" y2="92" stroke="rgba(212,175,55,0.01)" strokeWidth="0.3" className="hiw-svg-conn" />
                        <line x1="156" y1="58" x2="124" y2="78" stroke="rgba(212,175,55,0.008)" strokeWidth="0.3" className="hiw-svg-conn" />
                      </svg>
                    )}
                    {item.visualClass === 'rsn' && (
                      <svg className="hiw-svg-ill" viewBox="0 0 200 140" fill="none">
                        <circle cx="100" cy="70" r="6" stroke="rgba(212,175,55,0.06)" strokeWidth="0.5" />
                        <circle cx="100" cy="70" r="3" fill="rgba(212,175,55,0.08)"><animate attributeName="r" values="3;4;3" dur="2s" repeatCount="indefinite" /></circle>
                        <circle cx="100" cy="70" r="16" stroke="rgba(212,175,55,0.03)" strokeWidth="0.3" className="hiw-ring-1"><animate attributeName="r" values="16;24;16" dur="3s" repeatCount="indefinite" /></circle>
                        <circle cx="100" cy="70" r="28" stroke="rgba(212,175,55,0.02)" strokeWidth="0.3" className="hiw-ring-2"><animate attributeName="r" values="28;38;28" dur="3s" begin="0.5s" repeatCount="indefinite" /></circle>
                        <circle cx="100" cy="70" r="42" stroke="rgba(212,175,55,0.012)" strokeWidth="0.3" className="hiw-ring-3"><animate attributeName="r" values="42;52;42" dur="3s" begin="1s" repeatCount="indefinite" /></circle>
                        <circle cx="100" cy="70" r="55" stroke="rgba(212,175,55,0.008)" strokeWidth="0.2" strokeDasharray="2 4" className="hiw-ring-4"><animate attributeName="r" values="55;62;55" dur="3.5s" begin="1.5s" repeatCount="indefinite" /></circle>
                        <circle cx="60" cy="40" r="2" fill="rgba(212,175,55,0.03)" /><animate attributeName="opacity" values="0.03;0.15;0.03" dur="2.5s" begin="0.2s" repeatCount="indefinite" />
                        <circle cx="145" cy="50" r="2" fill="rgba(212,175,55,0.025)" /><animate attributeName="opacity" values="0.025;0.12;0.025" dur="3s" begin="0.7s" repeatCount="indefinite" />
                        <circle cx="55" cy="90" r="2" fill="rgba(212,175,55,0.025)" /><animate attributeName="opacity" values="0.025;0.12;0.025" dur="2.8s" begin="1.2s" repeatCount="indefinite" />
                        <circle cx="150" cy="85" r="2" fill="rgba(212,175,55,0.03)" /><animate attributeName="opacity" values="0.03;0.15;0.03" dur="2.2s" begin="0.4s" repeatCount="indefinite" />
                        <line x1="62" y1="42" x2="98" y2="68" stroke="rgba(212,175,55,0.008)" strokeWidth="0.3" />
                        <line x1="102" y1="68" x2="143" y2="52" stroke="rgba(212,175,55,0.008)" strokeWidth="0.3" />
                        <line x1="102" y1="72" x2="148" y2="83" stroke="rgba(212,175,55,0.008)" strokeWidth="0.3" />
                        <line x1="57" y1="88" x2="98" y2="72" stroke="rgba(212,175,55,0.008)" strokeWidth="0.3" />
                        {/* animated match dots along rings */}
                        <circle cx="100" cy="46" r="1.5" fill="rgba(212,175,55,0.06)"><animate attributeName="cx" values="100;130;100" dur="4s" repeatCount="indefinite" /><animate attributeName="cy" values="46;58;46" dur="4s" repeatCount="indefinite" /></circle>
                        <circle cx="100" cy="94" r="1.5" fill="rgba(212,175,55,0.04)"><animate attributeName="cx" values="100;70;100" dur="3.5s" begin="1s" repeatCount="indefinite" /><animate attributeName="cy" values="94;82;94" dur="3.5s" begin="1s" repeatCount="indefinite" /></circle>
                      </svg>
                    )}
                    {item.visualClass === 'exp' && (
                      <svg className="hiw-svg-ill" viewBox="0 0 200 140" fill="none">
                        <rect x="30" y="30" width="140" height="80" rx="8" stroke="rgba(212,175,55,0.025)" strokeWidth="0.3" />
                        <rect x="30" y="30" width="140" height="80" rx="8" fill="rgba(212,175,55,0.005)" />
                        <line x1="30" y1="55" x2="170" y2="55" stroke="rgba(212,175,55,0.01)" strokeWidth="0.3" />
                        <line x1="30" y1="75" x2="170" y2="75" stroke="rgba(212,175,55,0.01)" strokeWidth="0.3" />
                        <line x1="30" y1="95" x2="170" y2="95" stroke="rgba(212,175,55,0.01)" strokeWidth="0.3" />
                        <rect x="38" y="38" width="12" height="12" rx="2" fill="rgba(212,175,55,0.03)" />
                        <rect x="100" y="38" width="12" height="12" rx="2" fill="rgba(212,175,55,0.025)" />
                        <rect x="155" y="38" width="8" height="12" rx="2" fill="rgba(212,175,55,0.02)" />
                        <rect x="60" y="60" width="80" height="10" rx="3" fill="rgba(212,175,55,0.015)" className="hiw-svg-gleam" />
                        <rect x="60" y="60" width="16" height="10" rx="3" fill="rgba(212,175,55,0.06)"><animate attributeName="x" values="60;124;60" dur="4s" repeatCount="indefinite" /></rect>
                        <rect x="38" y="80" width="60" height="8" rx="2" fill="rgba(212,175,55,0.02)" />
                        <rect x="110" y="80" width="35" height="8" rx="2" fill="rgba(212,175,55,0.015)" />
                        <line x1="48" y1="46" x2="60" y2="63" stroke="rgba(212,175,55,0.012)" strokeWidth="0.3" strokeDasharray="1 2" />
                        <line x1="112" y1="46" x2="95" y2="63" stroke="rgba(212,175,55,0.012)" strokeWidth="0.3" strokeDasharray="1 2" />
                      </svg>
                    )}
                    {item.visualClass === 'prs' && (
                      <svg className="hiw-svg-ill" viewBox="0 0 200 140" fill="none">
                        {/* Hexagonal nodes for memory storage */}
                        <polygon points="100,20 122,34 122,62 100,76 78,62 78,34" stroke="rgba(212,175,55,0.025)" strokeWidth="0.3" className="hiw-svg-hex" />
                        <polygon points="100,20 122,34 122,62 100,76 78,62 78,34" fill="rgba(212,175,55,0.008)" />
                        <circle cx="100" cy="48" r="3" fill="rgba(212,175,55,0.06)"><animate attributeName="r" values="3;4.5;3" dur="3s" repeatCount="indefinite" /></circle>
                        <polygon points="100,64 116,74 116,94 100,104 84,94 84,74" stroke="rgba(212,175,55,0.018)" strokeWidth="0.3" />
                        <polygon points="100,64 116,74 116,94 100,104 84,94 84,74" fill="rgba(212,175,55,0.004)" />
                        <circle cx="100" cy="84" r="2" fill="rgba(212,175,55,0.045)"><animate attributeName="r" values="2;3.5;2" dur="3.5s" begin="0.5s" repeatCount="indefinite" /></circle>
                        <polygon points="60,50 76,60 76,80 60,90 44,80 44,60" stroke="rgba(212,175,55,0.015)" strokeWidth="0.3" />
                        <polygon points="60,50 76,60 76,80 60,90 44,80 44,60" fill="rgba(212,175,55,0.005)" />
                        <circle cx="60" cy="70" r="2" fill="rgba(212,175,55,0.04)"><animate attributeName="r" values="2;3;2" dur="4s" begin="1s" repeatCount="indefinite" /></circle>
                        <polygon points="140,50 156,60 156,80 140,90 124,80 124,60" stroke="rgba(212,175,55,0.02)" strokeWidth="0.3" />
                        <polygon points="140,50 156,60 156,80 140,90 124,80 124,60" fill="rgba(212,175,55,0.004)" />
                        <circle cx="140" cy="70" r="2" fill="rgba(212,175,55,0.04)"><animate attributeName="r" values="2;3;2" dur="3.8s" begin="1.5s" repeatCount="indefinite" /></circle>
                        {/* Connecting memory lines */}
                        <line x1="78" y1="42" x2="60" y2="58" stroke="rgba(212,175,55,0.006)" strokeWidth="0.3" />
                        <line x1="122" y1="42" x2="140" y2="58" stroke="rgba(212,175,55,0.006)" strokeWidth="0.3" />
                        <line x1="84" y1="82" x2="60" y2="70" stroke="rgba(212,175,55,0.006)" strokeWidth="0.3" />
                        <line x1="116" y1="82" x2="140" y2="70" stroke="rgba(212,175,55,0.006)" strokeWidth="0.3" />
                        {/* Memory particles flowing */}
                        <circle r="1" fill="rgba(212,175,55,0.06)"><animate attributeName="cx" values="100;78;100" dur="5s" repeatCount="indefinite" /><animate attributeName="cy" values="48;42;48" dur="5s" repeatCount="indefinite" /></circle>
                        <circle r="1" fill="rgba(212,175,55,0.04)"><animate attributeName="cx" values="100;122;100" dur="4.5s" begin="1s" repeatCount="indefinite" /><animate attributeName="cy" values="84;82;84" dur="4.5s" begin="1s" repeatCount="indefinite" /></circle>
                      </svg>
                    )}
                    <div className="hiw-visual-symbol" style={{ position: 'absolute', bottom: 16, right: 16, fontSize: 24, opacity: 0.04 }}>{item.visual}</div>
                    <div className="hiw-visual-label">{item.verb}</div>
                  </div>
                  <div className="hiw-content-area">
                    <div className="hiw-stage-count">{String(i + 1).padStart(2, '0')}</div>
                    <div className="hiw-stage-label">{item.label}</div>
                    <p className="hiw-stage-desc">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section compact" style={{ position: 'relative' }}>
        <KnowledgeNetwork />
        <RevealSection>
          <div className="section-label">Every operator. Every plant. Every decision.</div>
          <h2 className="section-title">The knowledge graph <span className="gold">grows with every shift</span></h2>
          <p className="section-sub" style={{ marginBottom: 24 }}>
            OperatorDNA learns from every expert in your organization, across every plant.
            The result is a continuously expanding memory of operational expertise.
          </p>
        </RevealSection>
        <div className={`knowledge-viz ${discoveryRef.className}`} ref={discoveryRef.ref}>
          <div className="knowledge-node">
            <div className="knowledge-node-icon">{'\uD83E\uDDE0'}</div>
            <div className="knowledge-node-label">Rajesh · 26yr</div>
            <div className="knowledge-node-desc">
              <strong style={{ color: 'var(--text-secondary)' }}>94% resolution rate</strong><br />
              Pressure spikes, pump cavitation, valve sequencing.<br />
              47 critical incidents — 0 escalations in 3 years.
            </div>
            <div className="em-stats" style={{ marginTop: 8 }}>
              <div className="em-stat"><div className="em-stat-val">94%</div><div className="em-stat-label">Rate</div></div>
              <div className="em-stat"><div className="em-stat-val">26y</div><div className="em-stat-label">Exp</div></div>
            </div>
          </div>
          <div className="knowledge-arrow">→</div>
          <div className="knowledge-node">
            <div className="knowledge-node-icon">{'\uD83E\uDDE0'}</div>
            <div className="knowledge-node-label">Priya · 5yr</div>
            <div className="knowledge-node-desc">
              <strong style={{ color: 'var(--text-secondary)' }}>Hidden expert — 91% precision</strong><br />
              Cooling tower specialist. Naturally conservative style.<br />
              System discovered her pattern: ramp down gradually, not abruptly.
            </div>
            <div className="em-stats" style={{ marginTop: 8 }}>
              <div className="em-stat"><div className="em-stat-val">91%</div><div className="em-stat-label">Rate</div></div>
              <div className="em-stat"><div className="em-stat-val">5y</div><div className="em-stat-label">Exp</div></div>
            </div>
          </div>
          <div className="knowledge-arrow">→</div>
          <div className="knowledge-node">
            <div className="knowledge-node-icon">{'\uD83D\uDD17'}</div>
            <div className="knowledge-node-label">Network Memory</div>
            <div className="knowledge-node-desc">
              <strong style={{ color: 'var(--text-secondary)' }}>Scales across every plant</strong><br />
              Every operator added strengthens the model.<br />
              Knowledge propagates automatically across sites.
            </div>
            <div className="em-stats" style={{ marginTop: 8 }}>
              <div className="em-stat"><div className="em-stat-val">5</div><div className="em-stat-label">Experts</div></div>
              <div className="em-stat"><div className="em-stat-val">∞</div><div className="em-stat-label">Scale</div></div>
            </div>
          </div>
        </div>

        <RevealSection>
          <div className="knowledge-propagation">
            <div className="kp-row">
              <span className="kp-label">Knowledge accumulated</span>
              <span className="kp-value">430 <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>operator-years</span></span>
            </div>
            <div className="kp-bar"><div className="kp-bar-fill" style={{ width: '72%' }} /></div>
            <div className="kp-row" style={{ marginTop: 12 }}>
              <span className="kp-label">Decision patterns learned</span>
              <span className="kp-value">2,847 <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>sequences</span></span>
            </div>
            <div className="kp-bar"><div className="kp-bar-fill" style={{ width: '58%', background: 'linear-gradient(90deg, var(--gold-600), var(--gold-400))' }} /></div>
            <div className="kp-row" style={{ marginTop: 12 }}>
              <span className="kp-label">Plants connected</span>
              <span className="kp-value">12 <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>facilities</span></span>
            </div>
            <div className="kp-bar"><div className="kp-bar-fill" style={{ width: '24%', background: 'linear-gradient(90deg, var(--gold-700), var(--gold-500))' }} /></div>
          </div>
        </RevealSection>
      </section>

      {/* ── HISTORICAL MEMORY — Horizontal timeline with varied card sizes ── */}
      <section className="section compact">
        <RevealSection>
          <div className="section-label">Historical Memory</div>
          <h2 className="section-title">Every incident ever <span className="gold">instantly replayable</span></h2>
          <p className="section-sub" style={{ marginBottom: 32 }}>
            Not a log. A memory. Every decision, every sequence, every outcome searchable in seconds.
          </p>
        </RevealSection>
        <RevealSection>
          <div className="hm-timeline">
            <div className="hm-timeline-line" />
            {[
              { year: 'Nov 2019', action: 'Pressure spike crisis', desc: 'Rajesh isolated downstream, reduced pump, stabilized reactor. 14 second recovery.', outcome: '12 min downtime avoided', impact: 3 },
              { year: 'Mar 2021', action: 'Cooling tower failure', desc: 'Priya identified cascade risk, rerouted coolant, prevented full shutdown.', outcome: '$340k loss prevented', impact: 5 },
              { year: 'Jun 2023', action: 'Compressor surge event', desc: 'Anita recognized precursor pattern, reduced load gradually, avoided trip.', outcome: 'Critical asset protected', impact: 4 },
              { year: 'Feb 2024', action: 'Feed pump malfunction', desc: 'Suresh executed non-standard restart sequence, restored feed in 3 minutes.', outcome: 'SOP updated', impact: 2 },
            ].map((item, i) => (
              <div key={i} className={`hm-card impact-${item.impact}`}>
                <div className="hm-card-dot" />
                <div className="hm-card-year">{item.year}</div>
                <div className="hm-card-action">{item.action}</div>
                <div className="hm-card-desc">{item.desc}</div>
                <div className="hm-card-outcome">{item.outcome}</div>
              </div>
            ))}
          </div>
        </RevealSection>
      </section>

      {/* ── VALUE — Asymmetric layout with hero stat ── */}
      <section className="value-section" id="value">
        <div className="value-inner">
          <RevealSection>
            <div className="section-label" style={{ textAlign: 'center' }}>Business Impact</div>
            <h2 className="section-title" style={{ textAlign: 'center' }}>
              <span className="gold">Enterprise value</span> that compounds
            </h2>
            <p className="section-sub" style={{ textAlign: 'center', margin: '0 auto 48px' }}>
              Every operator added. Every plant connected. Every decision captured.
            </p>
          </RevealSection>
          <RevealSection>
            <div className="value-asymmetric">
              <div className="value-hero">
                <div className="value-hero-number"><Counter target={94} suffix="%" className="value-hero-number" /></div>
                <div className="value-hero-label">Critical knowledge retained</div>
                <div className="value-hero-desc">Expert decision patterns preserved before retirement</div>
              </div>
              <div className="value-side">
                <div className="value-side-card">
                  <div className="value-side-number"><Counter target={78} suffix="%" className="value-side-number" /></div>
                  <div className="value-side-label">Retirement risk identified</div>
                  <div className="value-side-desc">Gaps in organizational knowledge surfaced</div>
                </div>
                <div className="value-side-card">
                  <div className="value-side-number"><Counter target={62} suffix="%" className="value-side-number" /></div>
                  <div className="value-side-label">Training time reduced</div>
                  <div className="value-side-desc">New operators learn from experience, not manuals</div>
                </div>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ── ARCHITECTURE ── */}
      <section className="section compact" id="architecture">
        <RevealSection>
          <div className="section-label">Architecture</div>
          <h2 className="section-title">The <span className="gold">Industrial Memory Pipeline</span></h2>
          <p className="section-sub" style={{ marginBottom: 28 }}>
            From raw plant data to actionable operational intelligence.
          </p>
        </RevealSection>
        <RevealSection>
          <ArchitecturePipeline />
        </RevealSection>
      </section>

      {/* ── FROM TRIBAL KNOWLEDGE TO ORGANIZATIONAL INTELLIGENCE ── */}
      <section className="section compact" style={{ maxWidth: 800, margin: '0 auto' }}>
        <RevealSection>
          <div className="section-label" style={{ textAlign: 'center' }}>The Knowledge Gap</div>
          <h2 className="section-title" style={{ textAlign: 'center', marginBottom: 20 }}>
            From <span className="gold">tribal knowledge</span> to<br />
            <span className="gold">organizational intelligence</span>
          </h2>
          <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
            <p className="section-sub" style={{ margin: '0 auto 24px', fontSize: 15, lineHeight: 1.8 }}>
              Most industrial facilities rely on undocumented expertise held by a handful of
              veteran operators. When they retire, their knowledge retires with them.
            </p>
            <p className="section-sub" style={{ margin: '0 auto', fontSize: 14, lineHeight: 1.8 }}>
              Manuals capture <em style={{ color: 'var(--text-secondary)' }}>what</em> to do.
              They never capture <em style={{ color: 'var(--gold-400)' }}>why</em> an expert
              chooses one sequence over another — or <em style={{ color: 'var(--text-secondary)' }}>when</em>
              to deviate from standard procedure entirely.
            </p>
          </div>
          <div style={{
            margin: '36px auto 0',
            width: 1, height: 32,
            background: 'linear-gradient(to bottom, rgba(212,175,55,0.04), transparent)',
          }} />
          <div style={{ display: 'flex', justifyContent: 'center', gap: 48, marginTop: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: 'var(--text-muted)' }}>87%</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-dim)', letterSpacing: 2, marginTop: 4 }}>OF KNOWLEDGE IS TACIT</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: 'var(--text-muted)' }}>60%</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-dim)', letterSpacing: 2, marginTop: 4 }}>NEVER DOCUMENTED</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: 'var(--text-muted)' }}>2×</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-dim)', letterSpacing: 2, marginTop: 4 }}>INCIDENT RISK AFTER RETIREMENT</div>
            </div>
          </div>
        </RevealSection>
      </section>

      <InteractiveDemo />

      <section className="adoption-section">
        <div className="adoption-inner">
          <RevealSection>
            <div className="section-label" style={{ textAlign: 'center' }}>Built for Industry</div>
            <h2 className="section-title" style={{ textAlign: 'center' }}>
              From <span className="gold">oil &amp; gas</span> to <span className="gold">pharma</span>
            </h2>
            <p className="section-sub" style={{ textAlign: 'center', margin: '0 auto' }}>
              Any plant with years of operational data can deploy OperatorDNA.
            </p>
          </RevealSection>
          <RevealSection>
            <div className="adoption-grid">
              {[
                { icon: '\uD83C\uDFED', title: 'Oil & Gas', desc: 'Refineries, pipelines, LNG terminals. Decades of operator knowledge at risk.' },
                { icon: '\u2697\uFE0F', title: 'Chemicals', desc: 'Batch processing, continuous reactors. Expert sequences critical for safety.' },
                { icon: '\uD83C\uDFE5', title: 'Pharma', desc: 'Regulated environments where operator expertise is irreplaceable.' },
                { icon: '\u26A1', title: 'Power Gen', desc: 'Turbine operations, grid balancing. Retiring workforce across the sector.' },
                { icon: '\uD83E\uDEA8', title: 'Mining', desc: 'Remote operations where expert knowledge is scarce and critical.' },
                { icon: '\uD83D\uDE97', title: 'Automotive', desc: 'Complex production lines with deep operator craft knowledge.' },
              ].map((item, i) => (
                <div key={i} className="adoption-card">
                  <div className="adoption-icon">{item.icon}</div>
                  <div className="adoption-title">{item.title}</div>
                  <div className="adoption-desc">{item.desc}</div>
                </div>
              ))}
            </div>
          </RevealSection>
          <RevealSection>
            <div style={{ textAlign: 'center', marginTop: 48 }}>
              <button type="button" className="hero-btn primary"
                onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}>
                Try the interactive demo
              </button>
            </div>
          </RevealSection>
        </div>
      </section>

      <footer className="footer">
        OperatorDNA · ET AI Hackathon 2026 · Problem Statement #8 — AI for Industrial Knowledge Intelligence
      </footer>
    </div>
  )
}