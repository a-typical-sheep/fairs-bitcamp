import React, { useRef, useState } from 'react'
import { Brain, Upload, Square, Video, Music, Settings, History, Plus, X, ExternalLink } from 'lucide-react'
import BrainViz from './BrainViz'

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

function joinUrl(base, path) {
  if (!base) {
    return path
  }
  return `${base}${path}`
}

async function fetchJson(path, init) {
  const response = await fetch(joinUrl(apiBase, path), init)
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Request failed: ${response.status}`)
  }
  return response.json()
}

function corpusUrl(filePath) {
  if (!filePath) {
    return null
  }
  const normalized = filePath.replace(/^corpus\//, '/corpus/')
  return joinUrl(apiBase, normalized.startsWith('/') ? normalized : `/${normalized}`)
}


function excerptText(item) {
  return item?.excerpt_text || item?.description || ''
}


export default function CortexCommons() {
  const fileInputRef = useRef(null)

  const [appState, setAppState] = useState('idle')
  const [inputValue, setInputValue] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [selectedResult, setSelectedResult] = useState(null)
  const [queryResult, setQueryResult] = useState(null)
  const [selectedExplanation, setSelectedExplanation] = useState(null)
  const [selectedActivations, setSelectedActivations] = useState(null)
  const activationsCacheRef = useRef({})
  const [brainRegions, setBrainRegions] = useState(null)
  const [historyItems, setHistoryItems] = useState([])
  const [errorMessage, setErrorMessage] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState([])

  const canSearch = inputValue.trim().length > 0

  const getCurrentStep = () => {
    if (appState === 'results') return 3
    if (appState === 'loading') return 2
    if (inputValue.includes('|')) return 2
    if (inputValue.length > 0) return 1
    return 0
  }

  // Load brain region parcellation once — used to label vertices on hover.
  React.useEffect(() => {
    let cancelled = false
    fetchJson('/brain/parcellation')
      .then((payload) => {
        if (cancelled) return
        setBrainRegions(payload.regions || [])
      })
      .catch(() => {
        // Non-fatal; tooltips just won't appear
        if (!cancelled) setBrainRegions([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleInputChange = (e) => {
    const nextValue = e.target.value
    setInputValue(nextValue)
    setErrorMessage('')

    if (nextValue.length > 0 && appState === 'idle') {
      setAppState('typing')
    } else if (nextValue.length === 0 && appState === 'typing') {
      setAppState('idle')
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || []).slice(0, 2)
    setUploadedFiles(files)
    setErrorMessage('')

    if (files.length > 0 && appState === 'idle') {
      setAppState('typing')
    }

    event.target.value = ''
  }

  const fetchActivationsForItem = async (itemId) => {
    if (!itemId) return null
    const cached = activationsCacheRef.current[itemId]
    if (cached) return cached
    try {
      const payload = await fetchJson(`/items/${encodeURIComponent(itemId)}/activation`)
      const arr = payload.activations_normalized
      activationsCacheRef.current[itemId] = arr
      return arr
    } catch (error) {
      // No raw neural available for this item — keep anatomy-only rendering
      activationsCacheRef.current[itemId] = null
      return null
    }
  }

  const fetchExplanationForResult = async (resultRow) => {
    const [payload, activations] = await Promise.all([
      fetchJson('/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input_a_id: activeScenario.input_a_id,
          result_id: resultRow.item.id,
          include_vertex_data: false,
        }),
      }),
      fetchActivationsForItem(resultRow.item.id),
    ])
    setSelectedExplanation(payload)
    setSelectedActivations(activations)
  }

  const runDemoQuery = async () => {
    setAppState('loading')
    setSelectedResult(null)
    setSelectedExplanation(null)
    setSelectedActivations(null)
    setErrorMessage('')

    try {
      const payload = await fetchJson('/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input_a_id: null,
          input_b_id: null,
          top_k: 3,
        }),
      })

      const rankedResults = [...(payload.results || [])]

      const decoratedResults = rankedResults.map((row) => ({
        ...row,
        displayScore: Math.round(100 * row.neural_score),
        topicDisplayScore: Math.round(100 * row.content_score),
        resultLabel: '',
      }))

      const nextPayload = {
        ...payload,
        results: decoratedResults,
      }

      setQueryResult(nextPayload)
      setAppState('results')
      setHistoryItems((current) => {
        const next = [inputValue.trim(), ...current]
        return Array.from(new Set(next)).slice(0, 6)
      })

      if (decoratedResults.length > 0) {
        setSelectedResult(decoratedResults[0])
        await fetchExplanationForResult(decoratedResults[0])
      }

      setInputValue('')
      setUploadedFiles([])
    } catch (error) {
      setAppState('typing')
      setErrorMessage(error.message || 'Query failed.')
    }
  }

  const handleSubmit = () => {
    if (appState === 'loading') {
      setAppState('idle')
      setInputValue('')
      setErrorMessage('')
      return
    }

    if (inputValue.trim()) {
      void runDemoQuery()
    }
  }

  const handleSelectResult = (row) => {
    setSelectedResult(row)
    void fetchExplanationForResult(row).catch((error) => {
      setErrorMessage(error.message || 'Failed to load explanation.')
    })
  }

  const resultRows = queryResult?.results || []
  const inputAItem = queryResult?.input_a_item || null
  const inputBItem = queryResult?.input_b_item || null

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-[#f5f3ee] font-sans overflow-hidden flex flex-col selection:bg-[#e2d8c6] selection:text-[#0b0b0b]">
      <nav
        className={`fixed top-0 right-0 z-50 backdrop-blur-md bg-[#0b0b0b]/82 border-b border-white/10 transition-all duration-300 ease-in-out ${
          isHistoryOpen ? 'left-80' : 'left-0'
        }`}
      >
        <div className="w-full px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="hover:bg-white/5 p-2 rounded transition-colors flex items-center justify-center border border-transparent hover:border-white/10"
            >
              <img src="/Fairs.png" alt="Fairs Logo" className="w-9 h-9 object-contain rounded-sm mix-blend-screen" />
            </button>
            <div className="flex flex-col">
              <span className="font-bold tracking-[0.15em] text-lg uppercase leading-none">FAIRS</span>
              <span className="text-[10px] text-[#a09a92] tracking-widest mt-1 uppercase opacity-60">Neural Commons</span>
            </div>
          </div>
        </div>
        {isMenuOpen && (
          <div className="absolute top-[72px] left-8 w-56 bg-[#141414] border border-white/10 shadow-2xl rounded-sm overflow-hidden py-2 z-50 animate-in fade-in slide-in-from-top-2">
            <button
              onClick={() => {
                setAppState('idle')
                setInputValue('')
                setUploadedFiles([])
                setQueryResult(null)
                setSelectedResult(null)
                setSelectedExplanation(null)
                setSelectedActivations(null)
                setErrorMessage('')
                setIsMenuOpen(false)
              }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 flex items-center space-x-3 transition-colors"
            >
              <Plus className="w-4 h-4 text-[#d7c29c]" /> <span className="font-medium">New Prompt</span>
            </button>
            <button
              onClick={() => {
                setIsHistoryOpen(true)
                setIsMenuOpen(false)
              }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 flex items-center space-x-3 transition-colors"
            >
              <History className="w-4 h-4 text-[#a09a92]" /> <span className="font-medium">History</span>
            </button>
            <div className="h-px w-full bg-white/10 my-2" />
            <button className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 flex items-center space-x-3 transition-colors">
              <Settings className="w-4 h-4 text-[#a09a92]" /> <span className="font-medium">Settings</span>
            </button>
          </div>
        )}
      </nav>

      <div
        className={`fixed inset-y-0 left-0 w-80 bg-[#0b0b0b] border-r border-white/10 z-[60] transform transition-transform duration-300 ease-out ${
          isHistoryOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 pt-24 relative">
          <button
            onClick={() => setIsHistoryOpen(false)}
            className="absolute top-8 right-6 p-2 text-[#a09a92] hover:text-white transition-colors rounded-md hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>

          <h3 className="text-xs uppercase tracking-widest text-[#a09a92] mb-6 font-bold">Past Queries</h3>

          <ul className="space-y-4">
            {historyItems.map((queryText, index) => (
              <li
                key={`${queryText}-${index}`}
                className="text-sm cursor-pointer hover:text-[#d7c29c] transition-colors truncate border-b border-white/5 pb-2"
                onClick={() => {
                  setInputValue(queryText)
                  setAppState('typing')
                  setIsHistoryOpen(false)
                }}
              >
                {queryText}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {isHistoryOpen && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[55]" onClick={() => setIsHistoryOpen(false)} />}
      <div className={`fixed inset-0 pointer-events-none flex items-center justify-center z-0 transition-opacity duration-500 ${appState === 'results' ? 'opacity-0' : 'opacity-100'}`}>
        <div className="relative flex flex-col items-center justify-center">
          <Brain
            className={`transition-all duration-1000 ease-in-out ${
              appState === 'idle'
                ? 'w-16 h-16 text-[#d7c29c] opacity-90'
                : appState === 'loading'
                  ? 'w-64 h-64 text-[#d7c29c] animate-[spin_4s_linear_infinite] drop-shadow-[0_0_25px_rgba(215,194,156,0.22)]'
                  : 'w-64 h-64 text-[#d7c29c] opacity-0'
            }`}
          />

          {appState === 'loading' && (
            <div className="mt-8 flex flex-col items-center animate-in fade-in duration-500">
              <p className="text-[#d7c29c] text-xs font-bold uppercase tracking-[0.3em] animate-pulse text-center">
                Analyzing neural + semantic similarity...
              </p>
              <p className="text-[#a09a92] text-[10px] uppercase tracking-widest mt-2 opacity-60 text-center">
                Analyzing neural + semantic similarity
              </p>
            </div>
          )}

          {(appState === 'idle' || appState === 'typing') && (
            <p
              className={`mt-6 text-center transition-all duration-700 ease-in-out font-medium tracking-wide ${
                appState === 'idle' ? 'text-xs text-[#a09a92] opacity-60' : 'text-sm text-[#d7c29c] opacity-100 translate-y-4'
              }`}
            >
              Upload a reference feeling or describe a vibe, then say what topic you want
            </p>
          )}

          {appState === 'loading' && (
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border border-[#d7c29c]/25 rounded-full animate-ping opacity-20"
              style={{ animationDuration: '2s' }}
            />
          )}
        </div>
      </div>

      <main className="flex-grow flex flex-col items-center relative px-6 pt-20 pb-24">
        {appState === 'results' && (
          <div className="w-full max-w-6xl mt-8 mb-32 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-all duration-500 ${selectedResult ? 'opacity-30 scale-[0.98] pointer-events-none blur-sm' : ''}`}>
              {resultRows.map((row, index) => {
                return (
                  <div
                    key={row.item.id}
                    onClick={() => handleSelectResult(row)}
                    className="bg-[#141414] border border-white/10 rounded-md p-4 hover:border-[#d7c29c]/45 transition-all group cursor-pointer relative overflow-hidden active:scale-95"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-sm bg-black/35 border border-white/10 flex items-center justify-center shrink-0">
                          {row.item.modalities?.includes('video') ? (
                            <Video className="w-4 h-4 text-[#a09a92]" />
                          ) : (
                            <Music className="w-4 h-4 text-[#a09a92]" />
                          )}
                        </div>
                        <h4 className="font-medium text-sm mb-1 group-hover:text-white transition-colors truncate">{row.item.title}</h4>
                      </div>
                      <span className="text-[11px] font-bold text-[#ece6db] whitespace-nowrap">{row.displayScore}/100</span>
                    </div>

                    <p className="text-[11px] text-[#a09a92] leading-relaxed min-h-[34px]">{row.resultLabel}</p>

                    <div className="space-y-2 mt-4">
                      <div className="flex items-center text-[10px] uppercase tracking-tighter">
                        <span className="w-16 text-[#a09a92]">Emotion</span>
                        <div className="flex-grow h-1 bg-black/40 rounded-full overflow-hidden">
                          <div className="h-full bg-[#d7c29c]" style={{ width: `${row.displayScore}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center text-[10px] uppercase tracking-tighter">
                        <span className="w-16 text-[#a09a92]">Topic</span>
                        <div className="flex-grow h-1 bg-black/40 rounded-full overflow-hidden">
                          <div className="h-full bg-[#7f7a72]" style={{ width: `${row.topicDisplayScore}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {selectedResult && (
              <div className="fixed inset-0 z-[70] bg-[#070707] animate-in fade-in duration-300 flex flex-col">
                <div className="absolute top-6 left-8 z-20">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#d7c29c]">Neural Analysis</h3>
                  <p className="text-sm font-medium text-white mt-1 max-w-[60vw] truncate">{selectedResult.item.title}</p>
                </div>
                <button
                  onClick={() => {
                    setSelectedResult(null)
                    setSelectedActivations(null)
                  }}
                  className="absolute top-6 right-6 z-20 p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[#a09a92] hover:text-white transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="flex-grow grid grid-cols-12 gap-0 pt-24 pb-10">
                  <div className="col-span-12 lg:col-span-8 relative min-h-0">
                    <BrainViz
                      className="absolute inset-0 w-full h-full"
                      activations={selectedActivations}
                      regions={brainRegions}
                    />
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.28em] text-white pointer-events-none">
                      Hover or click a region for detail
                    </div>
                    <div className="absolute bottom-6 left-8 flex items-center gap-6 text-[10px] uppercase tracking-[0.2em] text-[#a09a92] pointer-events-none">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full border border-white/20" style={{ background: 'rgb(235, 228, 218)' }} />
                        <span>Resting</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-24 h-2 rounded-full" style={{ background: 'linear-gradient(90deg, rgb(252, 238, 205), rgb(255, 155, 35) 50%, rgb(235, 30, 25))' }} />
                        <span>Stimulated</span>
                      </div>
                    </div>
                  </div>

                  <aside className="col-span-12 lg:col-span-4 border-l border-white/10 bg-[#0b0b0b]/70 backdrop-blur-sm px-8 py-6 overflow-y-auto flex flex-col gap-6">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-black/35 border border-white/10">
                        <span className="text-[9px] uppercase tracking-widest text-[#a09a92]">Similarity</span>
                        <p className="text-2xl font-bold text-[#ece6db] mt-1">{selectedResult.displayScore}/100</p>
                      </div>
                      <div className="p-3 bg-black/35 border border-white/10">
                        <span className="text-[9px] uppercase tracking-widest text-[#a09a92]">Shortlist</span>
                        <p className="text-2xl font-bold text-white mt-1">
                          Top {resultRows.findIndex((row) => row.item.id === selectedResult.item.id) + 1}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h5 className="text-[10px] font-bold uppercase tracking-widest text-[#a09a92] border-b border-white/10 pb-2">Observation Log</h5>
                      <p className="text-[12px] text-[#f5f3ee]/75 leading-relaxed italic">
                        {selectedExplanation?.summary || selectedResult.resultLabel}
                      </p>
                    </div>

                    <div className="p-4 bg-[#d7c29c]/8 border border-[#d7c29c]/20 rounded-sm">
                      <div className="flex items-center space-x-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-[#d7c29c] animate-pulse" />
                        <span className="text-[10px] font-bold uppercase text-[#d7c29c]">Neural Anchor Locked</span>
                      </div>
                      <p className="text-[11px] text-[#a09a92] leading-relaxed">
                        Comparing the feel of{' '}
                        <span className="text-white">{inputAItem?.title || 'the emotional anchor'}</span>{' '}
                        against shortlisted clips about{' '}
                        <span className="text-white">{inputBItem?.title || 'the selected topic'}</span>.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h5 className="text-[10px] font-bold uppercase tracking-widest text-[#a09a92] border-b border-white/10 pb-2">Regional Match with Anchor</h5>
                      <p className="text-[10px] text-[#a09a92]/70 leading-relaxed -mt-1 pb-1">
                        Similarity between this clip and <span className="text-white/80">{inputAItem?.title || 'the anchor'}</span> in each region. Hover the brain for that region's own activation level.
                      </p>
                      <div className="space-y-3">
                        {(selectedExplanation?.regions || []).slice(0, 5).map((region) => (
                          <div key={region.name} className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-white">{region.name}</span>
                              <span className="text-[#d7c29c] font-bold">{Math.round(region.score * 100)}/100</span>
                            </div>
                            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full"
                                style={{
                                  width: `${Math.max(0, Math.round(region.score * 100))}%`,
                                  background:
                                    'linear-gradient(90deg, rgb(252, 238, 205), rgb(255, 155, 35) 50%, rgb(235, 30, 25))',
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-auto space-y-3 pt-4 border-t border-white/10">
                      <p className="text-[10px] text-[#a09a92] leading-relaxed">{excerptText(selectedResult.item)}</p>
                      {selectedResult.item.source_url ? (
                        <a
                          className="w-full py-3 bg-[#ece6db] text-[#0b0b0b] font-bold text-[10px] uppercase tracking-[0.2em] hover:bg-white transition-colors flex items-center justify-center gap-2"
                          href={selectedResult.item.source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open Source Clip
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : null}
                    </div>
                  </aside>
                </div>
              </div>
            )}
          </div>
        )}

        <div
          className={`w-full max-w-2xl flex flex-col items-center transition-all duration-500 ease-in-out z-20 ${
            selectedResult ? 'opacity-0 pointer-events-none translate-y-6' : ''
          } ${
            appState === 'idle' ? 'absolute top-[75%] -translate-y-1/2' : 'fixed bottom-20'
          }`}
        >
          <div className="w-full flex justify-between items-center mb-6 px-2 max-w-xl mx-auto">
            {['Choose Feel', 'Choose About', 'Find Matches', 'Explore Brain'].map((step, index) => (
              <React.Fragment key={index}>
                <div className="flex flex-col items-center space-y-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-500 ${
                      getCurrentStep() === index
                        ? 'text-[#d7c29c] opacity-100 scale-110'
                        : getCurrentStep() > index
                          ? 'text-white opacity-40'
                          : 'text-[#a09a92] opacity-30'
                    }`}
                  >
                    {step}
                  </span>
                  <div
                    className={`h-1 w-8 rounded-full transition-all duration-700 ${
                      getCurrentStep() === index
                        ? 'bg-[#d7c29c] shadow-[0_0_8px_#d7c29c]'
                        : getCurrentStep() > index
                          ? 'bg-[#8b857c]'
                          : 'bg-[#1a1a1a]'
                    }`}
                  />
                </div>
                {index < 3 && (
                  <div className={`text-[#a09a92] opacity-20 text-xs mb-3 transition-opacity duration-500 ${getCurrentStep() > index ? 'opacity-40' : ''}`}>→</div>
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="w-full bg-[#141414] rounded-lg shadow-2xl border border-white/10 flex items-center p-2">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,video/*,audio/*,text/*" multiple />

            <button onClick={handleUploadClick} className="p-2 text-[#a09a92] hover:text-white transition-colors rounded-md hover:bg-white/5">
              <Upload className="w-4 h-4" />
            </button>

            <div className="flex-grow relative mx-3 h-10">
              <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={(event) => event.key === 'Enter' && handleSubmit()}
                className="w-full h-full bg-transparent text-[#f5f3ee] focus:outline-none text-sm relative z-10"
                placeholder={appState === 'idle' ? '' : 'Type the vibe/topic or upload files...'}
                autoComplete="off"
              />
              {inputValue === '' && appState === 'idle' && (
                <div className="absolute inset-0 flex items-center text-[#a09a92] text-sm pointer-events-none transition-opacity duration-500 italic opacity-60">
                  Upload a file or type a prompt to search...
                </div>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSearch && appState !== 'loading'}
              className={`px-5 py-2 rounded-sm text-sm font-bold transition-all min-h-[40px] min-w-[72px] active:scale-[0.97] flex items-center justify-center ${
                appState === 'loading'
                  ? 'bg-[#8b857c] text-[#0b0b0b] animate-pulse shadow-[0_0_15px_rgba(139,133,124,0.35)] cursor-wait'
                  : canSearch
                    ? 'bg-[#ece6db] text-[#0b0b0b] hover:bg-white shadow-lg'
                    : 'bg-black/40 text-[#a09a92] cursor-not-allowed opacity-60'
              }`}
            >
              {appState === 'loading' ? (
                <div className="flex items-center space-x-2">
                  <Square className="w-3 h-3 fill-current" />
                  <span>Stop</span>
                </div>
              ) : (
                'Find →'
              )}
            </button>
          </div>

          {errorMessage ? (
            <div className="mt-4 w-full rounded-sm border border-[#d7c29c]/20 bg-[#141414] px-4 py-3 text-left text-[11px] text-[#f5f3ee]">
              {errorMessage}
            </div>
          ) : null}

          {!errorMessage && uploadedFiles.length > 0 ? (
            <div className="mt-4 w-full rounded-sm border border-white/10 bg-[#141414] px-4 py-3 text-left text-[11px] text-[#f5f3ee]">
              <p className="text-[#a09a92]">
                Uploaded: {uploadedFiles.map((file) => file.name).join(', ')}
              </p>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
