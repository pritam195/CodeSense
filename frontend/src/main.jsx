import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

function App() {
  const [mode, setMode] = useState('zip')
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState('')
  const [uploads, setUploads] = useState([])
  const [selected, setSelected] = useState(null)
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadUploads() {
    const response = await fetch(`${apiBase}/api/uploads`)
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.detail ?? 'Could not load repositories.')
    setUploads(payload.uploads)
  }
  useEffect(() => { loadUploads().catch(err => setError(err.message)) }, [])

  async function submit(event) {
    event.preventDefault(); setError(''); setLoading(true)
    try {
      let response
      if (mode === 'zip') {
        if (!file) throw new Error('Choose a .zip archive first.')
        const body = new FormData(); body.append('file', file)
        response = await fetch(`${apiBase}/api/uploads`, { method: 'POST', body })
      } else {
        response = await fetch(`${apiBase}/api/uploads/git`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      }
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.detail ?? 'Upload failed.')
      setSelected(payload); setFiles([]); await loadUploads()
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  async function scan(upload) {
    setError(''); setLoading(true); setSelected(upload)
    try {
      const response = await fetch(`${apiBase}/api/uploads/${upload.id}/scan`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.detail ?? 'Scan failed.')
      const filesResponse = await fetch(`${apiBase}/api/uploads/${upload.id}/files`)
      const filePayload = await filesResponse.json()
      setFiles(filePayload.files)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return <main className="min-h-screen bg-slate-950 p-6 text-slate-100"><div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[380px_1fr]"><section className="rounded-2xl bg-slate-900 p-7 shadow-2xl"><p className="text-sm font-semibold text-cyan-400">CodeSense</p><h1 className="mt-2 text-3xl font-bold">Repositories</h1><p className="mt-3 text-slate-400">Saved repositories appear in the library. ZIP files can be scanned without executing code.</p><form className="mt-6 space-y-4" onSubmit={submit}><div className="flex gap-2"><button type="button" onClick={() => setMode('zip')} className={mode === 'zip' ? 'tab active' : 'tab'}>ZIP archive</button><button type="button" onClick={() => setMode('git')} className={mode === 'git' ? 'tab active' : 'tab'}>Git URL</button></div>{mode === 'zip' ? <input className="field" type="file" accept=".zip,application/zip" onChange={e => setFile(e.target.files?.[0] ?? null)} /> : <input className="field" type="url" placeholder="https://github.com/org/repo.git" value={url} onChange={e => setUrl(e.target.value)} required />}<button className="w-full rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50" disabled={loading}>{loading ? 'Working…' : 'Save repository'}</button></form>{error && <p className="mt-4 rounded-lg bg-red-950 p-3 text-sm text-red-200">{error}</p>}<div className="mt-7 space-y-2"><h2 className="font-semibold">Saved repositories</h2>{uploads.length === 0 && <p className="text-sm text-slate-500">None saved yet.</p>}{uploads.map(upload => <button key={upload.id} onClick={() => { setSelected(upload); setFiles([]) }} className="w-full rounded-lg bg-slate-800 p-3 text-left hover:bg-slate-700"><span className="block truncate font-medium">{upload.original_name}</span><span className="text-xs text-slate-400">{upload.source_type === 'zip' ? 'ZIP archive' : 'Git URL'}</span></button>)}</div></section><section className="rounded-2xl bg-slate-900 p-7 shadow-2xl"><h2 className="text-2xl font-bold">{selected ? selected.original_name : 'Select a repository'}</h2>{selected ? <><p className="mt-2 text-sm text-slate-400">Upload ID: <code>{selected.id}</code></p>{selected.source_type === 'zip' && <button onClick={() => scan(selected)} disabled={loading} className="mt-5 rounded-lg bg-emerald-300 px-4 py-2 font-semibold text-emerald-950">{loading ? 'Scanning…' : 'Scan and show files'}</button>}{selected.source_type === 'git_url' && <p className="mt-5 text-slate-400">Git URLs are saved but not fetched yet.</p>}{files.length > 0 && <div className="mt-6"><h3 className="font-semibold">Indexed files ({files.length})</h3><div className="mt-3 max-h-[520px] overflow-auto rounded-lg border border-slate-700">{files.map(item => <div key={item.path} className="border-b border-slate-800 px-4 py-3 last:border-0"><p className="font-mono text-sm text-cyan-300">{item.path}</p><p className="text-xs text-slate-400">{item.language} · {item.size_bytes} bytes</p></div>)}</div></div>}</> : <p className="mt-4 text-slate-400">Choose a saved repository to view its details and scan its source files.</p>}</section></div></main>
}
createRoot(document.getElementById('root')).render(<App />)
