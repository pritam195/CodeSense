import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import mermaid from 'mermaid'
import { marked } from 'marked'
import './styles.css'

mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' })

const api = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const iconFor = path => path.endsWith('.py') ? '🐍' : path.endsWith('.ts') || path.endsWith('.tsx') ? 'TS' : path.endsWith('.js') || path.endsWith('.jsx') ? 'JS' : '•'
const makeTree = files => { const root = {}; for (const file of files) { let node = root; const parts = file.path.split('/'); parts.forEach((part, index) => { if (index === parts.length - 1) node[part] = file; else node = node[part] ||= {}; }); } return root }
const tabLabel = (file, openFiles) => { const base = file.path.split('/').at(-1); const siblings = openFiles.filter(f => f.path.split('/').at(-1) === base); if (siblings.length < 2) return { name: base, dir: null }; const parts = file.path.split('/'); return { name: base, dir: parts.length > 1 ? parts.at(-2) : null }; }

function MermaidDiagram({ chart }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current || !chart) return
    const id = 'mermaid-' + Math.random().toString(36).slice(2)
    mermaid.render(id, chart).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg
    }).catch(err => {
      if (ref.current) ref.current.innerHTML = `<pre style="color:#f87171;white-space:pre-wrap">${chart}</pre>`
      console.error('Mermaid render error:', err)
    })
  }, [chart])
  return <div ref={ref} className="mermaid-output" />
}

function AnswerBlock({ answer }) {
  if (!answer) return null
  const fmt = answer.format ?? 'text'
  if (fmt === 'mermaid') {
    return (
      <div className="answer-diagram">
        <span className="answer-format-badge">Diagram</span>
        <MermaidDiagram chart={answer.answer} />
      </div>
    )
  }
  if (fmt === 'markdown') {
    return (
      <div
        className="answer-markdown"
        dangerouslySetInnerHTML={{ __html: marked.parse(answer.answer, { breaks: true, gfm: true }) }}
      />
    )
  }
  return <p className="answer-text">{answer.answer}</p>
}

function FileTree({ files, activeFile, onOpen }) {
  const [expanded, setExpanded] = useState(new Set())
  const root = useMemo(() => makeTree(files), [files])
  const render = (node, depth = 0, parent = '') => Object.entries(node).sort(([a, valueA], [b, valueB]) => (typeof valueA === 'object' && !valueA.path ? -1 : 1) - (typeof valueB === 'object' && !valueB.path ? -1 : 1) || a.localeCompare(b)).map(([name, value]) => {
    const folder = typeof value === 'object' && !value.path
    const key = `${parent}/${name}`
    if (folder) { const isOpen = expanded.has(key); return <div key={key}><button style={{ paddingLeft: 8 + depth * 14 }} className="tree-folder" onClick={() => setExpanded(previous => { const next = new Set(previous); isOpen ? next.delete(key) : next.add(key); return next })}><span>{isOpen ? '⌄' : '›'}</span><span>⌕</span><span className="truncate">{name}</span></button>{isOpen && render(value, depth + 1, key)}</div> }
    return <button key={value.path} style={{ paddingLeft: 26 + depth * 14 }} onClick={() => onOpen(value)} className={`file-item ${activeFile?.path === value.path ? 'selected' : ''}`}><span className="file-icon">{iconFor(value.path)}</span><span className="truncate">{name}</span></button>
  })
  return <nav className="file-tree">{render(root)}</nav>
}

function App() {
  const [uploads, setUploads] = useState([]), [repo, setRepo] = useState(), [screen, setScreen] = useState('library'), [files, setFiles] = useState([])
  const [openFiles, setOpenFiles] = useState([]), [activeFile, setActiveFile] = useState(null)
  const [question, setQuestion] = useState(''), [gitUrl, setGitUrl] = useState(''), [answer, setAnswer] = useState(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [zip, setZip] = useState()
  const call = async (path, options) => { const response = await fetch(api + path, options); const payload = response.status === 204 ? null : await response.json(); if (!response.ok) throw Error(payload?.detail || 'Request failed.'); return payload }
  useEffect(() => { call('/api/uploads').then(payload => setUploads(payload.uploads)).catch(error => setError(error.message)) }, [])
  const lines = useMemo(() => activeFile?.content?.split('\n') ?? [], [activeFile])

  function openFile(file) {
    if (!file) return
    setOpenFiles(prev => prev.find(f => f.path === file.path) ? prev : [...prev, file])
    setActiveFile(file)
  }

  function closeTab(file, e) {
    e.stopPropagation()
    setOpenFiles(prev => {
      const idx = prev.findIndex(f => f.path === file.path)
      const next = prev.filter(f => f.path !== file.path)
      setActiveFile(current => {
        if (current?.path !== file.path) return current
        return next[Math.max(0, idx - 1)] ?? next[0] ?? null
      })
      return next
    })
  }

  async function choose(item) { setRepo(item); setScreen('workspace'); setOpenFiles([]); setActiveFile(null); setAnswer(); setError(''); try { const payload = await call(`/api/uploads/${item.id}/files`); setFiles(payload.files); if (payload.files[0]) openFile(payload.files[0]); setError('') } catch { setFiles([]) } }
  async function upload(event) { event.preventDefault(); if (!zip) return; setBusy(true); try { const body = new FormData(); body.append('file', zip); const saved = await call('/api/uploads', { method: 'POST', body }); setUploads((await call('/api/uploads')).uploads); choose(saved) } catch (error) { setError(error.message) } finally { setBusy(false) } }
  async function saveGit(event) { event.preventDefault(); if (!gitUrl.trim()) return; setBusy(true); setError(''); try { const saved = await call('/api/uploads/git', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: gitUrl.trim() }) }); setUploads((await call('/api/uploads')).uploads); setGitUrl(''); await choose(saved); setError('') } catch (error) { setError(error.message) } finally { setBusy(false) } }
  async function removeRepo(item) { if (!item || !confirm(`Remove ${item.original_name}? This also removes its local index.`)) return; setBusy(true); try { await call(`/api/uploads/${item.id}`, { method: 'DELETE' }); setUploads(items => items.filter(entry => entry.id !== item.id)); if (repo?.id === item.id) { setRepo(); setFiles([]); setOpenFiles([]); setActiveFile(null); setAnswer(); setScreen('library') } } catch (error) { setError(error.message) } finally { setBusy(false) } }
  async function prepare() { setBusy(true); setError(''); try { let current = repo; if (current.source_type === 'git_url') { await call(`/api/uploads/${current.id}/fetch`, { method: 'POST' }); current = { ...current, source_type: 'zip' }; setRepo(current); setUploads(items => items.map(item => item.id === current.id ? current : item)) } for (const step of ['scan', 'parse', 'chunk', 'embed']) await call(`/api/uploads/${current.id}/${step}`, { method: 'POST' }); const indexed = await call(`/api/uploads/${current.id}/files`); setFiles(indexed.files); setOpenFiles([]); setActiveFile(null); if (indexed.files[0]) openFile(indexed.files[0]); setError('') } catch (error) { setError(error.message) } finally { setBusy(false) } }
  async function ask(event) { event.preventDefault(); if (!question.trim()) return; setBusy(true); setError(''); try { setAnswer(await call(`/api/uploads/${repo.id}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, limit: 5 }) })) } catch (error) { setError(error.message) } finally { setBusy(false) } }

  if (screen === 'library') return <main className="library-page"><header className="library-header"><span className="brand-mark">◈</span><strong>CodeSense</strong><span className="topbar-separator"/><span className="muted">Repository intelligence</span></header><section className="library-content"><div className="library-intro"><p className="eyebrow">YOUR WORKSPACE</p><h1>Choose a repository to explore</h1><p>Upload a ZIP or import a public GitHub repository. Select one to browse its source and ask grounded questions.</p></div><div className="import-grid"><form onSubmit={upload} className="import-card"><span className="import-icon">↑</span><h2>Upload a ZIP</h2><p>Index a local project archive.</p><input id="zip-input" type="file" accept=".zip" onChange={event => setZip(event.target.files?.[0])}/><button disabled={!zip || busy}>{busy ? 'Uploading…' : 'Choose ZIP file'}</button></form><form onSubmit={saveGit} className="import-card"><span className="import-icon">⌘</span><h2>Import from GitHub</h2><p>Public repositories only; no clone or execution.</p><input value={gitUrl} onChange={event => setGitUrl(event.target.value)} placeholder="https://github.com/owner/repo" type="url" required/><button disabled={!gitUrl.trim() || busy}>{busy ? 'Saving…' : 'Add GitHub repository'}</button></form></div>{error && <div className="library-error">{error}</div>}<div className="library-list-heading"><div><p className="eyebrow">SAVED REPOSITORIES</p><h2>Your library</h2></div><span>{uploads.length} repositories</span></div><div className="repository-grid">{uploads.length === 0 ? <p className="empty">Your uploaded repositories will appear here.</p> : uploads.map(item => <article key={item.id} className="repository-card"><div className="repo-card-icon">{item.source_type === 'git_url' ? '⌘' : '▣'}</div><div><h3>{item.original_name}</h3><p>{item.source_type === 'git_url' ? 'GitHub repository' : 'ZIP archive'}</p></div><div className="repository-actions"><button onClick={() => choose(item)}>Open workspace <span>→</span></button><button className="library-remove" onClick={() => removeRepo(item)} disabled={busy}>Remove</button></div></article>)}</div></section></main>

  return <main className="workspace">
    <header className="topbar"><span className="brand-mark">◈</span><strong>CodeSense</strong><span className="topbar-separator"/><span className="muted">Repository intelligence</span>{repo && <span className="repo-chip">{repo.original_name}</span>}</header>
    <div className="shell">
      <aside className="explorer"><div className="pane-heading"><span>EXPLORER</span><button title="Back to repository library" onClick={() => setScreen('library')}>←</button></div>
        {repo && <><div className="workspace-repo-name"><span>⌕</span><strong className="truncate">{repo.original_name}</strong></div><button className="prepare workspace-prepare" onClick={prepare} disabled={busy}>{busy ? 'Working…' : files.length === 0 ? (repo.source_type === 'git_url' ? 'Fetch & prepare' : 'Prepare repository') : 'Re-index repository'}</button><p className="section-label">FILES</p>{files.length === 0 ? <p className="empty tree-empty">Prepare this repository to browse files.</p> : <FileTree files={files} activeFile={activeFile} onOpen={openFile} />}</>}
      </aside>
      <section className="editor">
        <div className="tabbar">
          {openFiles.length === 0
            ? <span className="editor-hint">Open a file from the explorer</span>
            : openFiles.map(file => (
                <div
                  key={file.path}
                  className={`editor-tab${activeFile?.path === file.path ? ' active' : ''}`}
                  onClick={() => setActiveFile(file)}
                  title={file.path}
                >
                  <span className="tab-icon">{iconFor(file.path)}</span>
                  <span className="tab-name">
                    {(() => { const { name, dir } = tabLabel(file, openFiles); return dir ? <><span className="tab-dir">{dir} /</span> {name}</> : name })()}
                  </span>
                  <button className="tab-close" onClick={e => closeTab(file, e)}>×</button>
                </div>
              ))
          }
        </div>
        {activeFile
          ? <><div className="breadcrumb">{activeFile.path.split('/').join('  /  ')}</div><div className="code-area">{lines.map((line, index) => <div className="code-line" key={index}><span className="line-number">{index + 1}</span><code>{line || ' '}</code></div>)}</div></>
          : <div className="empty-editor"><span>CodeSense</span><p>Select and prepare a repository, then open a file.</p></div>
        }
      </section>
      <aside className="chat"><div className="chat-header"><div><p className="eyebrow">REPOSITORY CHAT</p><h1>Ask CodeSense</h1></div><span className="status-dot" title="Grounded answers"/></div>
        <div className="chat-scroll">{error && <div className="error">{error}</div>}{!answer && <div className="chat-empty"><div className="spark">✦</div><h2>Understand this codebase</h2><p>Ask about architecture, flows, or implementation details. Answers cite the exact repository lines used.</p></div>}{answer && <article className="answer"><p className="answer-label">GROUNDED ANSWER</p><AnswerBlock answer={answer} /><div className="citation-title">Sources</div>{answer.citations.map(citation => <button key={citation.path + citation.start_line} onClick={() => openFile(files.find(file => file.path === citation.path))} className="citation"><span>↗</span>{citation.path}<small>Lines {citation.start_line}–{citation.end_line}</small></button>)}</article>}</div>
        <form onSubmit={ask} className="composer"><textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder={repo ? 'Ask about this repository…' : 'Select a repository first'} disabled={!repo || busy} rows="3"/><div><span>{repo ? 'Answers include citations' : 'No repository selected'}</span><button disabled={!repo || busy || !question.trim()}>{busy ? 'Thinking…' : 'Send ↵'}</button></div></form>
      </aside>
    </div>
  </main>
}
createRoot(document.getElementById('root')).render(<App />)







