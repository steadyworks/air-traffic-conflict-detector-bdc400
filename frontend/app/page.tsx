'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Aircraft {
  callsign: string
  x: number       // nm, 0=west edge
  y: number       // nm, 0=south edge
  altitude: number // ft
  heading: number  // degrees, 0=North, 90=East
  speed: number    // knots
}


interface AppState {
  aircraft: Aircraft[]
  simTime: number
}
// TODO

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const LS_KEY = 'atcd_state'

function saveState(aircraft: Aircraft[], simTime: number): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ aircraft, simTime }))
  } catch {}
}

function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AppState
  } catch {
    return null
  }
}
// ---------------------------------------------------------------------------
// Aircraft component (with GSAP ring animation)
// ---------------------------------------------------------------------------

interface AircraftSvgProps {
  ac: Aircraft
  svgW: number
  svgH: number
  inConflict: boolean
  isSelected: boolean
  onClick: () => void
}

function AircraftSvg({ ac, svgW, svgH, inConflict, isSelected, onClick }: AircraftSvgProps) {
  // TODO
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

export default function App() {
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [simTime, setSimTime] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [selectedCallsign, setSelectedCallsign] = useState<string | null>(null)
  const [activeConflictKey, setActiveConflictKey] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState({
    callsign: '', x: '500', y: '500', altitude: '35000', heading: '0', speed: '480',
  })

  // Editor state
  const [editorHeading, setEditorHeading] = useState<string>('')
  const [editorSpeed, setEditorSpeed] = useState<string>('')

  // SVG dimensions (viewport)
  const [svgDims, setSvgDims] = useState({ w: 600, h: 600 })
  const radarRef = useRef<SVGSVGElement | null>(null)

  // Simulation loop refs
  const isPlayingRef = useRef(false)
  const lastTimeRef = useRef<number | null>(null)
  const animFrameRef = useRef<number | null>(null)

  // Derived conflicts
  const conflicts = useMemo(() => detectConflicts(aircraft), [aircraft])

  const conflictSet = useMemo(
    () => new Set(conflicts.flatMap((c) => [c.callsignA, c.callsignB])),
    [conflicts],
  )

  // Active conflict resolution
  const activeConflict = activeConflictKey
    ? conflicts.find((c) => `${c.callsignA}-${c.callsignB}` === activeConflictKey) ?? null
    : null

  const resolution = useMemo(() => {
    if (!activeConflict) return null
    const acA = aircraft.find((a) => a.callsign === activeConflict.callsignA)
    const acB = aircraft.find((a) => a.callsign === activeConflict.callsignB)
    if (!acA || !acB) return null
    return findResolution(acA, acB)
  }, [activeConflict, aircraft])

  // ---------------------------------------------------------------------------
  // Load state from localStorage on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const saved = loadState()
    if (saved) {
      setAircraft(saved.aircraft ?? [])
      setSimTime(saved.simTime ?? 0)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Persist to localStorage on every state change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    saveState(aircraft, simTime)
  }, [aircraft, simTime])

  // ---------------------------------------------------------------------------
  // SVG resize observer
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const svg = radarRef.current
    if (!svg) return
    const observer = new ResizeObserver(() => {
      const r = svg.getBoundingClientRect()
      setSvgDims({ w: r.width, h: r.height })
    })
    observer.observe(svg)
    const r = svg.getBoundingClientRect()
    setSvgDims({ w: r.width || 600, h: r.height || 600 })
    return () => observer.disconnect()
  }, [])

  // ---------------------------------------------------------------------------
  // Simulation loop
  // ---------------------------------------------------------------------------
  const animate = useCallback((now: number) => {
    if (!isPlayingRef.current) return
    if (lastTimeRef.current !== null) {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.5)
      setAircraft((prev) => updatePositions(prev, dt))
      setSimTime((prev) => prev + dt)
    }
    lastTimeRef.current = now
    animFrameRef.current = requestAnimationFrame(animate)
  }, [])

  useEffect(() => {
    isPlayingRef.current = isPlaying
    if (isPlaying) {
      lastTimeRef.current = null
      animFrameRef.current = requestAnimationFrame(animate)
    } else {
      lastTimeRef.current = null
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = null
      }
    }
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = null
      }
    }
  }, [isPlaying, animate])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  // TODO

  const handlePlay = useCallback(() => setIsPlaying(true), [])
  const handlePause = useCallback(() => setIsPlaying(false), [])
  const handleClearAll = useCallback(() => {
    setIsPlaying(false)
    setAircraft([])
    setSimTime(0)
    setSelectedCallsign(null)
    setActiveConflictKey(null)
    saveState([], 0)
  }, [])

  
  const handleApplyEdit = useCallback(() => {
    if (!selectedCallsign) return
    const newHeading = parseFloat(editorHeading)
    const newSpeed = parseFloat(editorSpeed)
    setAircraft((prev) =>
      prev.map((ac) =>
        ac.callsign === selectedCallsign
          ? {
              ...ac,
              heading: isNaN(newHeading) ? ac.heading : ((newHeading % 360) + 360) % 360,
              speed: isNaN(newSpeed) ? ac.speed : newSpeed,
            }
          : ac,
      ),
    )
  }, [selectedCallsign, editorHeading, editorSpeed])

  const handleApplyResolution = useCallback(() => {
    if (!activeConflict || !resolution) return
    const { callsignA } = activeConflict
    const { direction, degrees } = resolution
    setAircraft((prev) =>
      prev.map((ac) => {
        if (ac.callsign !== callsignA) return ac
        const delta = direction === 'right' ? degrees : -degrees
        const newHeading = ((ac.heading + delta) % 360 + 360) % 360
        return { ...ac, heading: newHeading }
      }),
    )
    setActiveConflictKey(null)
  }, [activeConflict, resolution])

  const selectedAc = selectedCallsign
    ? aircraft.find((a) => a.callsign === selectedCallsign) ?? null
    : null

  // ---------------------------------------------------------------------------
  // Render conflict lines
  // ---------------------------------------------------------------------------
  const conflictLines = useMemo(() => {
    return conflicts.map((c) => {
      const acA = aircraft.find((a) => a.callsign === c.callsignA)
      const acB = aircraft.find((a) => a.callsign === c.callsignB)
      if (!acA || !acB) return null
      return {
        key: `${c.callsignA}-${c.callsignB}`,
        x1: nmToSvgX(acA.x, svgDims.w),
        y1: nmToSvgY(acA.y, svgDims.h),
        x2: nmToSvgX(acB.x, svgDims.w),
        y2: nmToSvgY(acB.y, svgDims.h),
      }
    }).filter(Boolean)
  }, [conflicts, aircraft, svgDims])

  // ---------------------------------------------------------------------------
  // Grid lines
  // ---------------------------------------------------------------------------
  const gridLines = useMemo(() => {
    const lines = []
    for (let i = 1; i < 10; i++) {
      const frac = i / 10
      lines.push({ x1: frac * svgDims.w, y1: 0, x2: frac * svgDims.w, y2: svgDims.h })
      lines.push({ x1: 0, y1: frac * svgDims.h, x2: svgDims.w, y2: frac * svgDims.h })
    }
    return lines
  }, [svgDims])

  // ---------------------------------------------------------------------------
  // Suggestion text
  // ---------------------------------------------------------------------------
  let suggestionText = ''
  if (activeConflict) {
    if (!resolution) {
      suggestionText = `Suggest: descend ${activeConflict.callsignA}`
    } else {
      suggestionText = `Suggest: turn ${activeConflict.callsignA} ${resolution.direction} ${resolution.degrees}°`
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="app-container">
      {/* Radar */}
      <div className="radar-section">
        <div className="radar-wrapper">
          <svg
            ref={radarRef}
            data-testid="radar"
            className="radar-svg"
            viewBox={`0 0 ${svgDims.w} ${svgDims.h}`}
            preserveAspectRatio="none"
          >
            {/* Background */}
            <rect width={svgDims.w} height={svgDims.h} fill="#000811" />

            {/* Grid */}
            {gridLines.map((l, i) => (
              <line
                key={i}
                x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                className="radar-grid-line"
              />
            ))}

            {/* Conflict lines */}
            {conflictLines.map((l) =>
              l ? (
                <line
                  key={l.key}
                  x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                  stroke="#ff2200"
                  strokeWidth={1}
                  strokeDasharray="4,4"
                  opacity={0.6}
                />
              ) : null,
            )}

            {/* Aircraft */}
            {/* TODO */}
          </svg>
        </div>
      </div>

      {/* Sidebar */}
      <div className="sidebar">

        {/* Sim Controls */}
        <div className="panel">
          <h2>Simulation</h2>
          <div className="sim-controls">
            <span className="clock-display" data-testid="sim-clock">
              {simTime.toFixed(1)}s
            </span>
            <button data-testid="play-btn" onClick={handlePlay}>▶ Play</button>
            <button data-testid="pause-btn" onClick={handlePause}>⏸ Pause</button>
            <button data-testid="clear-all-btn" className="danger" onClick={handleClearAll}>
              Clear All
            </button>
          </div>
        </div>

        {/* Add Aircraft Form */}
        <div className="panel">
          <h2>Add Aircraft</h2>
          <form data-testid="add-aircraft-form">
            <div className="form-grid">
              <div className="form-field full-width">
                <label htmlFor="f-callsign">Callsign</label>
                <input
                  id="f-callsign"
                  type="text"
                  value={form.callsign}
                  onChange={(e) => setForm((p) => ({ ...p, callsign: e.target.value }))}
                  placeholder="AAL1"
                />
              </div>
              <div className="form-field">
                <label htmlFor="f-x">X (nm)</label>
                <input
                  id="f-x"
                  type="number"
                  value={form.x}
                  onChange={(e) => setForm((p) => ({ ...p, x: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label htmlFor="f-y">Y (nm)</label>
                <input
                  id="f-y"
                  type="number"
                  value={form.y}
                  onChange={(e) => setForm((p) => ({ ...p, y: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label htmlFor="f-altitude">Altitude (ft)</label>
                <input
                  id="f-altitude"
                  type="number"
                  value={form.altitude}
                  onChange={(e) => setForm((p) => ({ ...p, altitude: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label htmlFor="f-heading">Heading (°)</label>
                <input
                  id="f-heading"
                  type="number"
                  value={form.heading}
                  onChange={(e) => setForm((p) => ({ ...p, heading: e.target.value }))}
                />
              </div>
              <div className="form-field full-width">
                <label htmlFor="f-speed">Speed (kt)</label>
                <input
                  id="f-speed"
                  type="number"
                  value={form.speed}
                  onChange={(e) => setForm((p) => ({ ...p, speed: e.target.value }))}
                />
              </div>
              <button type="submit" className="submit-btn">Add Aircraft</button>
            </div>
          </form>
        </div>

        {/* Selected Aircraft Editor */}
        {selectedAc && (
          <div className="panel">
            <h2>Edit Aircraft</h2>
            <div
              data-testid="selected-aircraft"
              className="selected-panel"
            >
              <div className="selected-header">
                {selectedAc.callsign} — FL{Math.round(selectedAc.altitude / 100)}
              </div>
              <div className="edit-grid">
                <div className="edit-row">
                  <label htmlFor="edit-heading">Heading</label>
                  <input
                    id="edit-heading"
                    type="number"
                    value={editorHeading}
                    onChange={(e) => setEditorHeading(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleApplyEdit()}
                  />
                </div>
                <div className="edit-row">
                  <label htmlFor="edit-speed">Speed</label>
                  <input
                    id="edit-speed"
                    type="number"
                    value={editorSpeed}
                    onChange={(e) => setEditorSpeed(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleApplyEdit()}
                  />
                </div>
                <button onClick={handleApplyEdit}>Apply</button>
              </div>
            </div>
          </div>
        )}

        {/* Conflicts Panel */}
        <div className="panel">
          <h2>Conflicts</h2>
          <div data-testid="conflicts" className="conflict-list">
            {conflicts.length === 0 ? (
              <div className="no-conflicts">No conflicts detected</div>
            ) : (
              conflicts.map((c) => {
                const key = `${c.callsignA}-${c.callsignB}`
                const isActive = activeConflictKey === key
                return (
                  <div
                    key={key}
                    data-testid={`conflict-${key}`}
                    className={`conflict-entry ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveConflictKey(isActive ? null : key)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div
                      data-testid={`resolve-${key}`}
                      style={{ width: '100%' }}
                    >
                      <div className="conflict-callsigns">
                        ⚠ {c.callsignA} ↔ {c.callsignB}
                      </div>
                      <div className="conflict-details">
                        CPA: {c.timeToCPA.toFixed(1)}s | Sep: {c.minSep.toFixed(2)}nm | Closure: {c.closureRate.toFixed(0)}kt
                      </div>
                    </div>

                    {isActive && (
                      <div className="resolve-panel" onClick={(e) => e.stopPropagation()}>
                        <div data-testid="resolve-suggestion" className="resolve-suggestion">
                          {suggestionText}
                        </div>
                        <button
                          data-testid="apply-resolve-btn"
                          onClick={handleApplyResolution}
                        >
                          Apply
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
