import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// Activation colormap — anything above baseline becomes visibly yellow
// immediately, then ramps aggressively to strong orange by the midpoint and
// finishes in saturated red for the hottest regions.
function hotColor(t) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t
  let r, g, b
  if (x < 0.18) {
    // immediate baseline break: strong lemon yellow right away
    const u = x / 0.18
    r = 1.2 + u * (1.28 - 1.2)
    g = 1.0 + u * (0.92 - 1.0)
    b = 0.0
  } else if (x < 0.5) {
    // vivid yellow -> solid orange by halfway
    const u = (x - 0.18) / 0.32
    r = 1.28 + u * (1.38 - 1.28)
    g = 0.92 + u * (0.42 - 0.92)
    b = 0.0
  } else {
    // solid orange -> saturated bright red
    const u = (x - 0.5) / 0.5
    r = 1.32 + u * (1.5 - 1.32)
    g = 0.43 + u * (0.03 - 0.43)
    b = 0.01 + u * (0.01 - 0.01)
  }
  return [r, g, b]
}

function paintColors(nVerts, sulc, activations, threshold) {
  const colors = new Float32Array(nVerts * 3)
  for (let i = 0; i < nVerts; i++) {
    // Warm bone/ivory anatomical base — the brain's "blank state" is bright.
    // Sulcal folds add subtle variation so anatomy stays readable.
    const t = sulc ? sulc[i] : 0.6
    const baseR = 0.82 + t * (0.96 - 0.82)
    const baseG = 0.78 + t * (0.93 - 0.78)
    const baseB = 0.74 + t * (0.88 - 0.74)

    const a = activations ? activations[i] : 0

    if (!activations || a <= threshold) {
      colors[i * 3] = baseR
      colors[i * 3 + 1] = baseG
      colors[i * 3 + 2] = baseB
      continue
    }

    const remapped = (a - threshold) / (1 - threshold)
    const [hr, hg, hb] = hotColor(remapped)
    // Push the overlay in earlier so weak stimulation is clearly visible.
    const weight = 0.48 + 0.52 * Math.pow(remapped, 0.7)
    colors[i * 3] = baseR * (1 - weight) + hr * weight
    colors[i * 3 + 1] = baseG * (1 - weight) + hg * weight
    colors[i * 3 + 2] = baseB * (1 - weight) + hb * weight
  }
  return colors
}

function activationToVisualStrength(activation, threshold) {
  if (activation == null || !Number.isFinite(activation) || activation <= threshold) {
    return 0
  }
  const remapped = (activation - threshold) / (1 - threshold)
  return 0.48 + 0.52 * Math.pow(Math.max(0, Math.min(1, remapped)), 0.7)
}

// Hardcoded region meanings — what it means when this region is stimulated.
// Used as the source of truth for the tooltip description so the explanation
// is always present regardless of backend state.
const REGION_DETAILS = {
  'Visual Cortex':
    'Processes what you see — shape, motion, color, and spatial layout. Strong activation means the content is visually rich and actively driving perception.',
  'Auditory Cortex':
    'Processes sound — pitch, rhythm, timbre, and speech. Strong activation means the audio track is actively engaging the listener.',
  'Language Network':
    'Handles word meaning, grammar, and narrative structure. Activation indicates linguistic content is dominating — narration, dialogue, or reading.',
  'Default Mode Network':
    'Active during self-reflection, mind-wandering, and storytelling. Activation suggests the content is pulling viewers into inward thought or personal narrative.',
  'Attention Network':
    'Controls focus and cognitive control. Activation means viewers are actively concentrating, tracking key information, or resolving ambiguity.',
  'Motor Cortex':
    'Plans and simulates movement. Often lights up when watching physical action, sports, or rhythmic motion — the brain silently rehearsing what it sees.',
  'Salience Network':
    'Detects what is emotionally or perceptually important. Activation flags moments that feel surprising, emotionally charged, or stand out from the stream.',
  'Association Cortex':
    'Integrates information across senses, memory, and meaning. Activation suggests complex, high-level synthesis — abstract reasoning or connecting ideas.',
}

// Hardcoded 8-region parcellation of fsaverage5 (20484 vertices total).
// Must stay in sync with backend REGION_NAMES + _vertex_slices. Ranges are
// contiguous [start, stop) slices. This runs locally so the tooltip shows a
// real region even if /brain/parcellation hasn't resolved (or the backend
// isn't reachable).
const HARDCODED_REGIONS = [
  { name: 'Visual Cortex', start: 0, stop: 3200 },
  { name: 'Auditory Cortex', start: 3200, stop: 5400 },
  { name: 'Language Network', start: 5400, stop: 8200 },
  { name: 'Default Mode Network', start: 8200, stop: 10800 },
  { name: 'Attention Network', start: 10800, stop: 13400 },
  { name: 'Motor Cortex', start: 13400, stop: 15200 },
  { name: 'Salience Network', start: 15200, stop: 17400 },
  { name: 'Association Cortex', start: 17400, stop: 20484 },
]

function findRegionForVertex(regions, vertexIndex) {
  const list = regions && regions.length > 0 ? regions : HARDCODED_REGIONS
  for (let i = 0; i < list.length; i++) {
    const r = list[i]
    if (vertexIndex >= r.start && vertexIndex < r.stop) return r
  }
  // Very last resort: clamp to the last region if index is out of range.
  return list[list.length - 1]
}

function formatActivation(normalized) {
  const pct = Math.round(Math.max(0, Math.min(1, normalized ?? 0)) * 100)
  return `${pct}/100`
}

export default function BrainViz({ className = '', activations = null, threshold = 0.35, regions = null }) {
  const mountRef = useRef(null)
  // Refs for live updates without rebuilding the scene
  const meshRef = useRef(null)
  const sulcRef = useRef(null)
  const positionsRef = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const raycasterRef = useRef(new THREE.Raycaster())
  const pointerRef = useRef(new THREE.Vector2())
  const activationsRef = useRef(activations)
  const regionsRef = useRef(regions)
  const thresholdRef = useRef(threshold)
  const hoverLockedRef = useRef(false)

  activationsRef.current = activations
  regionsRef.current = regions
  thresholdRef.current = threshold

  const [hoverInfo, setHoverInfo] = useState(null) // { region, vertexIndex, pointActivation, visualStrength, x, y }

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x000000, 0)
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment()).texture

    const camera = new THREE.PerspectiveCamera(40, mount.clientWidth / mount.clientHeight, 0.1, 1500)
    camera.position.set(0, -200, 60)
    cameraRef.current = camera

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.minDistance = 100
    controls.maxDistance = 450
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.45
    controls.target.set(0, 0, 0)
    controls.enablePan = false
    controlsRef.current = controls

    // Lighting
    const keyLight = new THREE.DirectionalLight(0xfff5e6, 2.2)
    keyLight.position.set(60, -100, 120)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.8)
    fillLight.position.set(-80, 60, -80)
    scene.add(fillLight)
    const rimLight = new THREE.DirectionalLight(0xd7c29c, 1.4)
    rimLight.position.set(10, 120, -60)
    scene.add(rimLight)

    let animId

    fetch('/brain_mesh.json')
      .then((r) => r.json())
      .then((data) => {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices, 3))
        geo.setIndex(new THREE.Uint32BufferAttribute(data.faces, 1))
        geo.computeVertexNormals()

        const nVerts = data.vertices.length / 3
        sulcRef.current = data.sulc
        positionsRef.current = data.vertices

        const colors = paintColors(nVerts, data.sulc, activationsRef.current, thresholdRef.current)
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

        const mat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.62,
          metalness: 0.0,
          envMapIntensity: 0.45,
          emissive: new THREE.Color(0x1a1612),
          emissiveIntensity: 0.05,
          side: THREE.DoubleSide,
        })

        const mesh = new THREE.Mesh(geo, mat)
        mesh.rotation.x = -Math.PI / 2
        scene.add(mesh)
        meshRef.current = mesh
      })
      .catch(() => {
        const geo = new THREE.SphereGeometry(60, 32, 32)
        const mat = new THREE.MeshStandardMaterial({ color: 0xd7c29c, roughness: 0.7 })
        const mesh = new THREE.Mesh(geo, mat)
        scene.add(mesh)
        meshRef.current = mesh
      })

    // --- Hover / click handlers ---
    // Interpolate the activation directly across the hit triangle so the
    // tooltip corresponds to the color actually shown under the cursor.
    const aVec = new THREE.Vector3()
    const bVec = new THREE.Vector3()
    const cVec = new THREE.Vector3()
    const bary = new THREE.Vector3()

    function getHoverSignal(intersect) {
      const { face, point, object } = intersect
      if (!face || !object || !object.geometry) {
        return { vertexIndex: -1, pointActivation: null }
      }
      const positions = object.geometry.getAttribute('position')
      if (!positions) {
        return { vertexIndex: -1, pointActivation: null }
      }

      const localPoint = object.worldToLocal(point.clone())
      aVec.fromBufferAttribute(positions, face.a)
      bVec.fromBufferAttribute(positions, face.b)
      cVec.fromBufferAttribute(positions, face.c)
      THREE.Triangle.getBarycoord(localPoint, aVec, bVec, cVec, bary)

      const weights = [
        { index: face.a, weight: bary.x },
        { index: face.b, weight: bary.y },
        { index: face.c, weight: bary.z },
      ]
      weights.sort((left, right) => right.weight - left.weight)

      let pointActivation = null
      const acts = activationsRef.current
      if (acts) {
        const aActivation = acts[face.a] ?? 0
        const bActivation = acts[face.b] ?? 0
        const cActivation = acts[face.c] ?? 0
        pointActivation =
          bary.x * aActivation +
          bary.y * bActivation +
          bary.z * cActivation
      }

      return {
        vertexIndex: weights[0]?.index ?? -1,
        pointActivation,
      }
    }

    function performRaycast(clientX, clientY) {
      const mesh = meshRef.current
      const cam = cameraRef.current
      if (!mesh || !cam) return null

      const rect = renderer.domElement.getBoundingClientRect()
      const x = ((clientX - rect.left) / rect.width) * 2 - 1
      const y = -((clientY - rect.top) / rect.height) * 2 + 1
      pointerRef.current.set(x, y)

      raycasterRef.current.setFromCamera(pointerRef.current, cam)
      const hits = raycasterRef.current.intersectObject(mesh, false)
      if (!hits || hits.length === 0) return null

      const { vertexIndex, pointActivation } = getHoverSignal(hits[0])
      if (vertexIndex < 0) return null

      const regs = regionsRef.current
      const region = findRegionForVertex(regs, vertexIndex)
      const visualStrength = activationToVisualStrength(pointActivation, thresholdRef.current)

      return {
        region,
        vertexIndex,
        pointActivation,
        visualStrength,
        x: clientX - rect.left,
        y: clientY - rect.top,
      }
    }

    function onPointerMove(event) {
      if (hoverLockedRef.current) return
      const info = performRaycast(event.clientX, event.clientY)
      if (!info) {
        setHoverInfo(null)
        if (controlsRef.current) controlsRef.current.autoRotate = true
        renderer.domElement.style.cursor = 'grab'
        return
      }
      setHoverInfo(info)
      // Pause auto-rotate while the user is inspecting, so the label target
      // doesn't drift out from under the cursor.
      if (controlsRef.current) controlsRef.current.autoRotate = false
      renderer.domElement.style.cursor = 'pointer'
    }

    function onPointerLeave() {
      if (hoverLockedRef.current) return
      setHoverInfo(null)
      if (controlsRef.current) controlsRef.current.autoRotate = true
      renderer.domElement.style.cursor = 'grab'
    }

    function onClick(event) {
      const info = performRaycast(event.clientX, event.clientY)
      if (!info) {
        hoverLockedRef.current = false
        return
      }
      // Toggle: click a region to pin the tooltip; click again (or same region) to unpin.
      hoverLockedRef.current = !hoverLockedRef.current
      setHoverInfo(info)
      if (controlsRef.current) controlsRef.current.autoRotate = !hoverLockedRef.current
    }

    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerleave', onPointerLeave)
    renderer.domElement.addEventListener('click', onClick)
    renderer.domElement.style.cursor = 'grab'

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(mount)

    function loop() {
      animId = requestAnimationFrame(loop)
      controls.update()
      renderer.render(scene, camera)
    }
    loop()

    return () => {
      cancelAnimationFrame(animId)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
      renderer.domElement.removeEventListener('click', onClick)
      controls.dispose()
      renderer.dispose()
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement)
      }
      meshRef.current = null
      sulcRef.current = null
      positionsRef.current = null
      rendererRef.current = null
      cameraRef.current = null
      controlsRef.current = null
    }
  }, [])

  // Live repaint when activations/threshold change
  useEffect(() => {
    const mesh = meshRef.current
    const sulc = sulcRef.current
    if (!mesh || !sulc) return
    const colorAttr = mesh.geometry.getAttribute('color')
    if (!colorAttr) return
    const nVerts = colorAttr.count
    const newColors = paintColors(nVerts, sulc, activations, threshold)
    colorAttr.array.set(newColors)
    colorAttr.needsUpdate = true
  }, [activations, threshold])

  // When activations change (new item), clear any pinned hover label
  useEffect(() => {
    hoverLockedRef.current = false
    setHoverInfo(null)
    if (controlsRef.current) controlsRef.current.autoRotate = true
  }, [activations])

  // Decide whether to place the tooltip to the right or left of the cursor
  // based on mount width, so it never clips off-screen.
  let tooltipStyle = null
  if (hoverInfo && mountRef.current) {
    const w = mountRef.current.clientWidth
    const h = mountRef.current.clientHeight
    const placeLeft = hoverInfo.x > w - 300
    const placeAbove = hoverInfo.y > h - 220
    tooltipStyle = {
      left: placeLeft ? undefined : hoverInfo.x + 16,
      right: placeLeft ? (w - hoverInfo.x) + 16 : undefined,
      top: placeAbove ? undefined : hoverInfo.y + 16,
      bottom: placeAbove ? (h - hoverInfo.y) + 16 : undefined,
    }
  }

  return (
    <div ref={mountRef} className={className} style={{ touchAction: 'none' }}>
      {hoverInfo && hoverInfo.region && tooltipStyle && (
        <div
          className="absolute z-30 pointer-events-none w-[280px] max-w-[80%] px-4 py-3 bg-[#0b0b0b]/95 backdrop-blur-md border border-[#d7c29c]/30 rounded-sm shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          style={tooltipStyle}
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d7c29c]">
              {hoverInfo.region.name}
            </span>
            {hoverInfo.pointActivation != null && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background:
                    hoverInfo.visualStrength > 0
                      ? 'linear-gradient(90deg, rgb(252, 238, 205), rgb(255, 155, 35) 50%, rgb(235, 30, 25))'
                      : 'rgba(235, 228, 218, 0.85)',
                  color: hoverInfo.visualStrength > 0 ? '#1a0a05' : '#2a2520',
                }}
                title="Stimulation at the exact point under the cursor"
              >
                {formatActivation(hoverInfo.visualStrength)}
              </span>
            )}
          </div>
          <p className="text-[9px] uppercase tracking-[0.18em] text-[#a09a92] mb-1">
            Local stimulation at cursor
          </p>
          <p className="text-[11px] text-[#f5f3ee]/85 leading-relaxed">
            {REGION_DETAILS[hoverInfo.region.name] || hoverInfo.region.description}
          </p>
          {hoverInfo.pointActivation != null && (
            <p className="mt-2 text-[9px] uppercase tracking-[0.18em] text-[#a09a92] opacity-75">
              Raw normalized signal: {formatActivation(hoverInfo.pointActivation)}
            </p>
          )}
          {hoverLockedRef.current && (
            <p className="mt-2 text-[9px] uppercase tracking-[0.2em] text-[#a09a92] opacity-70">
              Click again to release
            </p>
          )}
        </div>
      )}
    </div>
  )
}
