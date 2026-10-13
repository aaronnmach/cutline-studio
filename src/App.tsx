import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  ArrowDownToLine, ArrowUpRight, Check, CheckCircle2, ChevronDown,
  Clapperboard, Clock3, FileVideo2, Film, Gauge, LockKeyhole,
  MessageSquareText, Play, Plus, Radio, Scissors, Settings2,
  Sparkles, Upload, WandSparkles, X,
} from 'lucide-react'
import './workspace.css'

type Health = { ffmpegReady: boolean }
type VideoSource = { name: string; url: string; duration: number; width: number; height: number; demo: boolean; file?: File }
type RenderedClip = { id: string; name: string; url: string; duration: number; size: number }
type ShareDraft = { id: string; title: string; status: string; createdAt: string }

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safeSeconds / 60).toString().padStart(2, '0')}:${(safeSeconds % 60).toString().padStart(2, '0')}`
}

const formatBytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`

function App() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [source, setSource] = useState<VideoSource | null>(null)
  const [rendered, setRendered] = useState<RenderedClip | null>(null)
  const [drafts, setDrafts] = useState<ShareDraft[]>([])
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(15)
  const [hook, setHook] = useState('THE ROOM LOST IT')
  const [caption, setCaption] = useState('wait for the reaction')
  const [postCaption, setPostCaption] = useState('the whole room broke at once')
  const [style, setStyle] = useState<'reaction' | 'story' | 'chaos'>('reaction')
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [isQueueing, setIsQueueing] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    async function loadWorkspace() {
      try {
        const [healthResponse, demoResponse, jobsResponse] = await Promise.all([
          fetch('/api/health'), fetch('/api/demo'), fetch('/api/share-drafts'),
        ])
        if (!healthResponse.ok || !demoResponse.ok || !jobsResponse.ok) throw new Error('Local service is not ready')
        const healthData = (await healthResponse.json()) as Health
        const demoData = (await demoResponse.json()) as Omit<VideoSource, 'demo'>
        const draftsData = (await jobsResponse.json()) as ShareDraft[]
        if (!active) return
        setHealth(healthData)
        setSource({ ...demoData, demo: true })
        setEnd(Math.min(17, demoData.duration))
        setDrafts(draftsData)
      } catch {
        if (active) setNotice('Start the local video service to load the sample clip.')
      }
    }
    void loadWorkspace()
    return () => { active = false }
  }, [])

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setNotice('Choose a video file to continue.')
      return
    }
    const previewUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = previewUrl
    video.onloadedmetadata = () => {
      setSource({ name: file.name, url: previewUrl, duration: video.duration, width: video.videoWidth, height: video.videoHeight, demo: false, file })
      setStart(0)
      setEnd(Math.min(30, video.duration))
      setRendered(null)
      setNotice('Source loaded. Shape the edit, then render a preview.')
    }
  }

  const renderClip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!source) return
    setIsRendering(true)
    setNotice('Building the vertical edit…')
    try {
      const form = new FormData()
      if (source.file) form.append('video', source.file)
      if (source.demo) form.append('useDemo', 'true')
      form.append('start', String(start))
      form.append('end', String(end))
      form.append('hook', hook)
      form.append('caption', caption)
      form.append('style', style)
      const response = await fetch('/api/render', { method: 'POST', body: form })
      const result = (await response.json()) as RenderedClip & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Render failed')
      setRendered(result)
      setNotice('Render complete. Review the cut before adding it to your queue.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Render failed. Check the local service.')
    } finally {
      setIsRendering(false)
    }
  }

  const saveShareDraft = async () => {
    if (!rendered || !rightsConfirmed) return
    setIsQueueing(true)
    try {
      const response = await fetch('/api/share-drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId: rendered.id, title: postCaption, rightsConfirmed }),
      })
      const result = (await response.json()) as ShareDraft & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Could not save publish draft')
      setDrafts((current) => [result, ...current.filter((item) => item.id !== result.id)])
      setNotice('Saved locally. Nothing has been posted.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save publish draft')
    } finally {
      setIsQueueing(false)
    }
  }

  const resetToDemo = async () => {
    if (source?.url.startsWith('blob:')) URL.revokeObjectURL(source.url)
    try {
      const response = await fetch('/api/demo')
      const demoData = (await response.json()) as Omit<VideoSource, 'demo'>
      setSource({ ...demoData, demo: true })
      setStart(0)
      setEnd(Math.min(17, demoData.duration))
      setRendered(null)
      setNotice('Sample clip loaded.')
    } catch {
      setNotice('Could not load the sample clip.')
    }
  }

  const duration = source ? Math.max(0, end - start) : 0

  return (
    <div className="studio-shell">
      <aside className="rail">
        <a className="brand-mark" href="#studio" aria-label="Cutline Studio home"><Scissors size={20} strokeWidth={2.3} /></a>
        <div className="rail-divider" />
        <button className="rail-button active" aria-label="Clip studio" title="Clip studio"><Clapperboard size={18} /></button>
        <button className="rail-button" aria-label="Share drafts" title="Share drafts" onClick={() => document.getElementById('share-drafts')?.scrollIntoView({ behavior: 'smooth' })}><Radio size={18} /></button>
        <div className="rail-spacer" />
        <button className="rail-button" aria-label="Settings" title="Settings" onClick={() => setNotice('Publishing settings are shown in the queue panel.')}><Settings2 size={18} /></button>
        <div className="avatar">C</div>
      </aside>

      <main className="studio-main" id="studio">
        <header className="topbar">
          <div className="wordmark">CUTLINE <span>STUDIO</span></div>
          <div className="topbar-right"><span className="local-badge"><span className="status-dot" /> LOCAL WORKSPACE</span><span className="topbar-divider" /><span className="account-state"><LockKeyhole size={14} /> Manual export</span></div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div><div className="eyebrow"><span>01</span> CREATOR EDIT DESK</div><h1>Make the moment <em>move.</em></h1><p>Shape one scene into a short-form edit. Review every cut before it leaves this workspace.</p></div>
            <div className="heading-stat"><span className="stat-glyph"><Gauge size={18} /></span><span><strong>REVIEW STATUS</strong><small>No virality model connected</small></span></div>
          </section>

          <section className="workspace-grid">
            <div className="edit-column">
              <section className="panel source-panel">
                <div className="panel-heading"><div className="panel-title"><span className="step-number">A</span><div><h2>Source footage</h2><p>Drop a clip or use the supplied sample</p></div></div><button className="icon-button" type="button" title="Choose a video" aria-label="Choose a video" onClick={() => fileInput.current?.click()}><Upload size={17} /></button><input ref={fileInput} className="visually-hidden" type="file" accept="video/mp4,video/quicktime,video/webm,video/*" onChange={selectFile} /></div>
                <div className="source-row"><div className="source-file-icon"><FileVideo2 size={19} /></div><div className="source-copy"><strong>{source?.name || 'Loading sample…'}</strong><span>{source ? `${formatTime(source.duration)} · ${source.width} × ${source.height} · ${source.demo ? 'workspace sample' : 'uploaded source'}` : 'Checking local video service'}</span></div><button className="text-button" type="button" onClick={resetToDemo}><Film size={14} /> Sample</button></div>
              </section>

              <form className="panel edit-panel" onSubmit={renderClip}>
                <div className="panel-heading"><div className="panel-title"><span className="step-number">B</span><div><h2>Edit direction</h2><p>Choose a treatment and tell the edit what matters</p></div></div><span className="ai-chip"><Sparkles size={13} /> STYLE PRESET</span></div>
                <div className="field-label">EDIT STYLE</div>
                <div className="style-picker" role="group" aria-label="Edit style">
                  <button type="button" className={style === 'reaction' ? 'style-option selected' : 'style-option'} onClick={() => setStyle('reaction')}><span className="style-icon reaction-icon">!</span><span><b>Reaction</b><small>Face-first, punchy</small></span>{style === 'reaction' && <Check size={15} />}</button>
                  <button type="button" className={style === 'story' ? 'style-option selected' : 'style-option'} onClick={() => setStyle('story')}><span className="style-icon story-icon">↗</span><span><b>Story</b><small>Context, then payoff</small></span>{style === 'story' && <Check size={15} />}</button>
                  <button type="button" className={style === 'chaos' ? 'style-option selected' : 'style-option'} onClick={() => setStyle('chaos')}><span className="style-icon chaos-icon">✳</span><span><b>Chaos</b><small>Fast, high-energy</small></span>{style === 'chaos' && <Check size={15} />}</button>
                </div>
                <label className="field-label" htmlFor="hook">OPENING TEXT <span>Optional · appears at the top</span></label><input id="hook" className="text-input" value={hook} maxLength={64} onChange={(event) => setHook(event.target.value)} placeholder="A short hook for this moment" />
                <label className="field-label" htmlFor="caption-overlay">ON-SCREEN CAPTION <span>Optional · burned into the edit</span></label><input id="caption-overlay" className="text-input" value={caption} maxLength={90} onChange={(event) => setCaption(event.target.value)} placeholder="Add a punchline or context" />
                <div className="trim-heading"><label className="field-label" htmlFor="trim-start">SELECT MOMENT</label><span className="trim-readout">{formatTime(start)} <span>→</span> {formatTime(end)} <b>{formatTime(duration)}</b></span></div>
                <div className="range-row"><span>IN</span><input id="trim-start" type="range" min={0} max={Math.max(0, (source?.duration || 1) - 1)} step={0.25} value={start} onChange={(event) => setStart(Math.min(Number(event.target.value), end - 1))} /><output>{formatTime(start)}</output></div>
                <div className="range-row"><span>OUT</span><input aria-label="Clip end time" type="range" min={Math.min(start + 1, source?.duration || 1)} max={source?.duration || 1} step={0.25} value={end} onChange={(event) => setEnd(Number(event.target.value))} /><output>{formatTime(end)}</output></div>
                <div className="range-track" aria-hidden="true"><span style={{ left: `${source ? (start / source.duration) * 100 : 0}%`, width: `${source ? (duration / source.duration) * 100 : 0}%` }} /></div>
                <div className="render-row"><div className="render-note"><WandSparkles size={16} /><span>9:16 canvas · layered blur · color grade · text treatment</span></div><button className="primary-button" type="submit" disabled={!source || isRendering || duration < 1}>{isRendering ? <><span className="spinner" /> Rendering</> : <><Sparkles size={16} /> Render edit <ArrowUpRight size={15} /></>}</button></div>
              </form>

              <section className="panel queue-panel" id="share-drafts">
                <div className="panel-heading"><div className="panel-title"><span className="step-number">C</span><div><h2>Export handoff</h2><p>Prepare a caption and keep a local share note</p></div></div><span className="locked-tag"><ArrowDownToLine size={12} /> MANUAL</span></div>
                <div className="publish-fields"><label className="field-label" htmlFor="post-caption">POST CAPTION</label><textarea id="post-caption" className="text-input caption-input" rows={2} maxLength={150} value={postCaption} onChange={(event) => setPostCaption(event.target.value)} /><label className="rights-check"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} /><span className="custom-check"><Check size={12} /></span><span>I have permission to use this footage in my project.</span></label><button className="queue-button" type="button" onClick={() => void saveShareDraft()} disabled={!rendered || !rightsConfirmed || isQueueing}>{isQueueing ? 'Saving note…' : <><Plus size={16} /> Save posting notes</>}</button><p className="publish-note"><LockKeyhole size={13} /> This local app does not auto-post. TikTok’s Direct Post guidelines exclude private one-account upload utilities; download the MP4 and post through TikTok yourself when your usage is cleared.</p></div>
                {drafts.length > 0 && <div className="queue-list">{drafts.slice(0, 3).map((item) => <div className="queue-item" key={item.id}><Clock3 size={14} /><span><strong>{item.title || 'Untitled post'}</strong><small>{item.status.replaceAll('_', ' ')} · {new Date(item.createdAt).toLocaleString()}</small></span><ChevronDown size={14} /></div>)}</div>}
              </section>
            </div>

            <aside className="preview-column">
              <section className="preview-panel">
                <div className="preview-topline"><span><span className="live-dot" /> LIVE PREVIEW</span><span className="ratio-tag">9:16</span></div>
                <div className="phone-stage"><div className="phone-frame"><div className="phone-screen">
                  {rendered ? <video key={rendered.url} controls playsInline src={rendered.url} /> : source ? <video key={source.url} controls playsInline src={source.url} /> : <div className="video-placeholder"><Film size={28} /><span>Choose a source clip</span></div>}
                  {!rendered && <div className="preview-overlay"><span className="preview-label">{style === 'reaction' ? 'REACTION CUT' : style === 'story' ? 'STORY CUT' : 'CHAOS CUT'}</span>{hook && <strong>{hook}</strong>}<span className="preview-caption">{caption}</span></div>}
                  <div className="phone-ui"><span className="phone-notch" /><span className="phone-bottom" /></div>
                </div></div>{!rendered && <div className="preview-hint"><Play size={13} /> Render to preview the finished edit</div>}</div>
                <div className="preview-meta"><span><span className="meta-dot" /> {rendered ? 'RENDER READY' : 'SOURCE PREVIEW'}</span><span>{rendered ? formatTime(rendered.duration) : source ? formatTime(source.duration) : '--:--'}</span></div>
                {rendered && <div className="export-row"><div className="export-copy"><CheckCircle2 size={16} /><span><strong>Vertical export ready</strong><small>{formatBytes(rendered.size)} · MP4 / H.264</small></span></div><a className="download-button" href={rendered.url} download={rendered.name} aria-label="Download rendered clip" title="Download rendered clip"><ArrowDownToLine size={17} /></a></div>}
              </section>
              <section className="signal-panel"><div className="signal-heading"><span className="signal-icon"><MessageSquareText size={16} /></span><div><strong>CREATIVE SIGNALS</strong><small>Heuristic, not a virality guarantee</small></div><button type="button" className="signal-info" title="Signals describe the edit treatment, not a prediction of views." aria-label="About creative signals">i</button></div><div className="signal-list"><div><span>Opening hook</span><span className="signal-value">{hook ? 'Added' : 'None'}</span></div><div><span>Caption treatment</span><span className="signal-value">{caption ? 'Added' : 'None'}</span></div><div><span>Moment length</span><span className="signal-value">{duration > 0 ? `${Math.round(duration)} sec` : '--'}</span></div></div><div className="signal-foot"><span>NO PREDICTION MODEL CONNECTED</span><span className="signal-bars"><i /><i /><i /><i /><i /></span></div></section>
              <div className="workflow-note"><div className="workflow-mark"><Scissors size={15} /></div><p><strong>Make the edit mean something.</strong> Reframing and captions change presentation, not rights. Keep permission for derivative edits and posting on file.</p></div>
            </aside>
          </section>

          <footer className="workspace-footer"><span><span className="footer-led" /> LOCAL RENDER ENGINE {health?.ffmpegReady ? 'READY' : 'CHECKING'}</span><span>CLIPLINE 0.1 <span className="footer-separator">/</span> BUILT FOR CREATOR WORKFLOWS</span></footer>
        </div>
      </main>
      {notice && <div className="toast" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss message"><X size={16} /></button></div>}
    </div>
  )
}

export default App
