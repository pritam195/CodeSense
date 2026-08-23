import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const api = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const iconFor = path => path.endsWith('.py') ? '🐍' : path.endsWith('.ts') || path.endsWith('.tsx') ? 'TS' : path.endsWith('.js') || path.endsWith('.jsx') ? 'JS' : '•'
const makeTree = files => { const root = {}; for (const file of files) { let node = root; const parts = file.path.split('/'); parts.forEach((part, index) => { if (index === parts.length - 1) node[part] = file; else node = node[part] ||= {}; }); } return root }
function FileTree({ files, open, onOpen }) {
  const [expanded, setExpanded] = useState(new Set())
  const root = useMemo(() => makeTree(files), [files])
  const render = (node, depth = 0, parent = '') => Object.entries(node).sort(([a, valueA], [b, valueB]) => (typeof valueA === 'object' && !valueA.path ? -1 : 1) - (typeof valueB === 'object' && !valueB.path ? -1 : 1) || a.localeCompare(b)).map(([name, value]) => {
    const folder = typeof value === 'object' && !value.path
    const key = `${parent}/${name}`
    if (folder) { const isOpen = expanded.has(key); return <div key={key}><button style={{ paddingLeft: 8 + depth * 14 }} className="tree-folder" onClick={() => setExpanded(previous => { const next = new Set(previous); isOpen ? next.delete(key) : next.add(key); return next })}><span>{isOpen ? '⌄' : '›'}</span><span>⌕</span><span className="truncate">{name}</span></button>{isOpen && render(value, depth + 1, key)}</div> }
    return <button key={value.path} style={{ paddingLeft: 26 + depth * 14 }} onClick={() => onOpen(value)} className={`file-item ${open?.path === value.path ? 'selected' : ''}`}><span className="file-icon">{iconFor(value.path)}</span><span className="truncate">{name}</span></button>
  })
  return <nav className="file-tree">{render(root)}</nav>
}

function App() {
  const [uploads, setUploads] = useState([]), [repo, setRepo] = useState(), [screen, setScreen] = useState('library'), [files, setFiles] = useState([]), [open, setOpen] = useState()
  const [question, setQuestion] = useState(''), [gitUrl, setGitUrl] = useState(''), [answer, setAnswer] = useState(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [zip, setZip] = useState()
  const call = async (path, options) => { const response = await fetch(api + path, options); const payload = response.status === 204 ? null : await response.json(); if (!response.ok) throw Error(payload?.detail || 'Request failed.'); return payload }
  useEffect(() => { call('/api/uploads').then(payload => setUploads(payload.uploads)).catch(error => setError(error.message)) }, [])
  const lines = useMemo(() => open?.content?.split('\n') ?? [], [open])

  async function choose(item) { setRepo(item); setScreen('workspace'); setOpen(); setAnswer(); setError(''); try { const payload = await call(`/api/uploads/${item.id}/files`); setFiles(payload.files); if (payload.files[0]) setOpen(payload.files[0]); setError('') } catch { setFiles([]) } }
  async function upload(event) { event.preventDefault(); if (!zip) return; setBusy(true); try { const body = new FormData(); body.append('file', zip); const saved = await call('/api/uploads', { method: 'POST', body }); setUploads((await call('/api/uploads')).uploads); choose(saved) } catch (error) { setError(error.message) } finally { setBusy(false) } }
  async function saveGit(event) { event.preventDefault(); if (!gitUrl.trim()) return; setBusy(true); setError(''); try { const saved = await call('/api/uploads/git', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: gitUrl.trim() }) }); setUploads((await call('/api/uploads')).uploads); setGitUrl(''); await choose(saved); setError('') } catch (error) { setError(error.message) } finally { setBusy(false) } }
  async function removeRepo(item) { if (!item || !confirm(`Remove ${item.original_name}? This also removes its local index.`)) return; setBusy(true); try { await call(`/api/uploads/${item.id}`, { method: 'DELETE' }); setUploads(items => items.filter(entry => entry.id !== item.id)); if (repo?.id === item.id) { setRepo(); setFiles([]); setOpen(); setAnswer(); setScreen('library') } } catch (error) { setError(error.message) } finally { setBusy(false) } }
  async function prepare() { setBusy(true); setError(''); try { let current = repo; if (current.source_type === 'git_url') { await call(`/api/uploads/${current.id}/fetch`, { method: 'POST' }); current = { ...current, source_type: 'zip' }; setRepo(current); setUploads(items => items.map(item => item.id === current.id ? current : item)) } for (const step of ['scan', 'parse', 'chunk', 'embed']) await call(`/api/uploads/${current.id}/${step}`, { method: 'POST' }); const indexed = await call(`/api/uploads/${current.id}/files`); setFiles(indexed.files); if (indexed.files[0]) setOpen(indexed.files[0]); setError('') } catch (error) { setError(error.message) } finally { setBusy(false) } }
  async function ask(event) { event.preventDefault(); if (!question.trim()) return; setBusy(true); setError(''); try { setAnswer(await call(`/api/uploads/${repo.id}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, limit: 5 }) })) } catch (error) { setError(error.message) } finally { setBusy(false) } }

  if (screen === 'library') return <main className="library-page"><header className="library-header"><span className="brand-mark">◈</span><strong>CodeSense</strong><span className="topbar-separator"/><span className="muted">Repository intelligence</span></header><section className="library-content"><div className="library-intro"><p className="eyebrow">YOUR WORKSPACE</p><h1>Choose a repository to explore</h1><p>Upload a ZIP or import a public GitHub repository. Select one to browse its source and ask grounded questions.</p></div><div className="import-grid"><form onSubmit={upload} className="import-card"><span className="import-icon">↑</span><h2>Upload a ZIP</h2><p>Index a local project archive.</p><input id="zip-input" type="file" accept=".zip" onChange={event => setZip(event.target.files?.[0])}/><button disabled={!zip || busy}>{busy ? 'Uploading…' : 'Choose ZIP file'}</button></form><form onSubmit={saveGit} className="import-card"><span className="import-icon">⌘</span><h2>Import from GitHub</h2><p>Public repositories only; no clone or execution.</p><input value={gitUrl} onChange={event => setGitUrl(event.target.value)} placeholder="https://github.com/owner/repo" type="url" required/><button disabled={!gitUrl.trim() || busy}>{busy ? 'Saving…' : 'Add GitHub repository'}</button></form></div>{error && <div className="library-error">{error}</div>}<div className="library-list-heading"><div><p className="eyebrow">SAVED REPOSITORIES</p><h2>Your library</h2></div><span>{uploads.length} repositories</span></div><div className="repository-grid">{uploads.length === 0 ? <p className="empty">Your uploaded repositories will appear here.</p> : uploads.map(item => <article key={item.id} className="repository-card"><div className="repo-card-icon">{item.source_type === 'git_url' ? '⌘' : '▣'}</div><div><h3>{item.original_name}</h3><p>{item.source_type === 'git_url' ? 'GitHub repository' : 'ZIP archive'}</p></div><div className="repository-actions"><button onClick={() => choose(item)}>Open workspace <span>→</span></button><button className="library-remove" onClick={() => removeRepo(item)} disabled={busy}>Remove</button></div></article>)}</div></section></main>
  return <main className="workspace">
    <header className="topbar"><span className="brand-mark">◈</span><strong>CodeSense</strong><span className="topbar-separator"/><span className="muted">Repository intelligence</span>{repo && <span className="repo-chip">{repo.original_name}</span>}</header>
    <div className="shell">
      <aside className="explorer"><div className="pane-heading"><span>EXPLORER</span><button title="Back to repository library" onClick={() => setScreen('library')}>←</button></div>
        
        {repo && <><div className="workspace-repo-name"><span>⌕</span><strong className="truncate">{repo.original_name}</strong></div><button className="prepare workspace-prepare" onClick={prepare} disabled={busy}>{busy ? 'Working…' : files.length === 0 ? (repo.source_type === 'git_url' ? 'Fetch & prepare' : 'Prepare repository') : 'Re-index repository'}</button><p className="section-label">FILES</p>{files.length === 0 ? <p className="empty tree-empty">Prepare this repository to browse files.</p> : <FileTree files={files} open={open} onOpen={setOpen} />}</>}
      </aside>
      <section className="editor"><div className="tabbar">{open ? <div className="editor-tab"><span>{iconFor(open.path)}</span><span>{open.path.split('/').at(-1)}</span><button onClick={() => setOpen()}>×</button></div> : <span className="editor-hint">Open a file from the explorer</span>}</div>
        {open ? <><div className="breadcrumb">{open.path.split('/').join('  /  ')}</div><div className="code-area">{lines.map((line, index) => <div className="code-line" key={index}><span className="line-number">{index + 1}</span><code>{line || ' '}</code></div>)}</div></> : <div className="empty-editor"><span>CodeSense</span><p>Select and prepare a repository, then open a file.</p></div>}
      </section>
      <aside className="chat"><div className="chat-header"><div><p className="eyebrow">REPOSITORY CHAT</p><h1>Ask CodeSense</h1></div><span className="status-dot" title="Grounded answers"/></div>
        <div className="chat-scroll">{error && <div className="error">{error}</div>}{!answer && <div className="chat-empty"><div className="spark">✦</div><h2>Understand this codebase</h2><p>Ask about architecture, flows, or implementation details. Answers cite the exact repository lines used.</p></div>}{answer && <article className="answer"><p className="answer-label">GROUNDED ANSWER</p><p className="answer-text">{answer.answer}</p><div className="citation-title">Sources</div>{answer.citations.map(citation => <button key={citation.path + citation.start_line} onClick={() => setOpen(files.find(file => file.path === citation.path))} className="citation"><span>↗</span>{citation.path}<small>Lines {citation.start_line}–{citation.end_line}</small></button>)}</article>}</div>
        <form onSubmit={ask} className="composer"><textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder={repo ? 'Ask about this repository…' : 'Select a repository first'} disabled={!repo || busy} rows="3"/><div><span>{repo ? 'Answers include citations' : 'No repository selected'}</span><button disabled={!repo || busy || !question.trim()}>{busy ? 'Thinking…' : 'Send ↵'}</button></div></form>
      </aside>
    </div>
  </main>
}
createRoot(document.getElementById('root')).render(<App />)







