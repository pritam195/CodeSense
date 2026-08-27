import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { motion } from 'framer-motion'
import { Code2, Menu, MessageSquare } from 'lucide-react'
import mermaid from 'mermaid'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import TextareaAutosize from 'react-textarea-autosize'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { LibraryPage } from './components/library/LibraryPage'
import { ExplorerSidebar } from './components/workspace/ExplorerSidebar'
import { EditorPanel } from './components/workspace/EditorPanel'
import { ChatPanel } from './components/workspace/ChatPanel'
import { FileIcon } from './components/workspace/FileTree'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { VscFileCode, VscFolder, VscFolderOpened, VscChevronRight, VscChevronDown, VscFileMedia, VscCode } from 'react-icons/vsc'
import { SiPython, SiJavascript, SiTypescript, SiHtml5, SiCss, SiReact, SiMarkdown } from 'react-icons/si'
import { cn } from './lib/utils'
import './styles.css'

const api = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'



function useResizer(defaultWidth, minWidth, maxWidth, reverse = false) {
  const [width, setWidth] = useState(defaultWidth);
  const [isDragging, setIsDragging] = useState(false);

  const startDrag = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMouseMove = (e) => {
      let newWidth = reverse ? window.innerWidth - e.clientX : e.clientX;
      setWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)));
    };
    const onMouseUp = () => setIsDragging(false);

    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, reverse, minWidth, maxWidth]);

  return [width, startDrag, isDragging];
}

function App() {
  const [uploads, setUploads] = useState([]), [repo, setRepo] = useState(), [screen, setScreen] = useState('library'), [files, setFiles] = useState([])
  const [openFiles, setOpenFiles] = useState([]), [activeFile, setActiveFile] = useState(null)
  const [question, setQuestion] = useState(''), [gitUrl, setGitUrl] = useState(''), [messages, setMessages] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [zip, setZip] = useState()
  const [initialLoading, setInitialLoading] = useState(true)
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const call = async (path, options) => { const response = await fetch(api + path, options); const payload = response.status === 204 ? null : await response.json(); if (!response.ok) throw Error(payload?.detail || 'Request failed.'); return payload }
  useEffect(() => { call('/api/uploads').then(payload => setUploads(payload.uploads)).catch(error => setError(error.message)).finally(() => setInitialLoading(false)) }, [])
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

  async function choose(item) { setRepo(item); setScreen('workspace'); setOpenFiles([]); setActiveFile(null); setMessages([]); setError(''); try { const payload = await call(`/api/uploads/${item.id}/files`); setFiles(payload.files); if (payload.files[0]) openFile(payload.files[0]); setError('') } catch { setFiles([]) } }

  async function prepare() { setBusy(true); setError(''); try { let current = repo; if (current.source_type === 'git_url') { await call(`/api/uploads/${current.id}/fetch`, { method: 'POST' }); current = { ...current, source_type: 'zip' }; setRepo(current); setUploads(items => items.map(item => item.id === current.id ? current : item)) } for (const step of ['scan', 'parse', 'chunk', 'embed']) await call(`/api/uploads/${current.id}/${step}`, { method: 'POST' }); const indexed = await call(`/api/uploads/${current.id}/files`); setFiles(indexed.files); setOpenFiles([]); setActiveFile(null); if (indexed.files[0]) openFile(indexed.files[0]); setError('') } catch (error) { setError(error.message) } finally { setBusy(false) } }

  async function ask(event, overrideQuestion) {
    if (event) event.preventDefault();
    const q = (overrideQuestion ?? question).trim();
    if (!q) return;
    setQuestion('');
    // If it's a regenerate, we don't necessarily want to duplicate the user message
    // but for simplicity, we can just let it act as a new query, or we can pop the last assistant message.
    // Let's pop the last assistant message if we are regenerating.
    if (overrideQuestion) {
      setMessages(prev => {
        const newMsgs = [...prev];
        if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === 'assistant') {
          newMsgs.pop();
        }
        return newMsgs;
      });
    } else {
      setMessages(prev => [...prev, { role: 'user', content: q }]);
    }
    
    setBusy(true);
    setError('');
    try {
      const payload = await call(`/api/uploads/${repo.id}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, limit: 5 }) });
      setMessages(prev => [...prev, { role: 'assistant', ...payload }]);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  const [leftWidth, startLeftDrag, isLeftDragging] = useResizer(240, 150, 400);
  const [rightWidth, startRightDrag, isRightDragging] = useResizer(340, 250, 600, true);

  if (screen === 'library') {
    return (
      <LibraryPage
        uploads={uploads}
        setUploads={setUploads}
        setRepo={setRepo}
        setScreen={setScreen}
        setOpenFiles={setOpenFiles}
        setActiveFile={setActiveFile}
        setMessages={setMessages}
        setError={setError}
        error={error}
        busy={busy}
        setBusy={setBusy}
        call={call}
        initialLoading={initialLoading}
      />
    )
  }

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Topbar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-4 shadow-sm z-20">
        <div className="flex items-center gap-3">
          {screen === 'workspace' && (
            <button 
              className="md:hidden flex h-7 w-7 items-center justify-center rounded hover:bg-secondary text-muted-foreground transition-colors"
              onClick={() => setMobileExplorerOpen(!mobileExplorerOpen)}
            >
              <Menu size={16} />
            </button>
          )}
          <div className="flex h-7 w-7 items-center justify-center rounded bg-accent/10 text-accent">
            <Code2 size={16} />
          </div>
          <strong className="text-[13px] font-semibold tracking-wide text-foreground">CodeSense</strong>
          <span className="h-4 w-px bg-border mx-1" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground hidden sm:block">Repository Intelligence</span>
        </div>
        
        {repo && (
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-border/50 bg-background/50 px-3 py-1 shadow-inner">
              <span className="text-xs font-medium text-muted-foreground truncate max-w-[200px]">
                {repo.original_name.split('/').pop()}
              </span>
            </div>
            {screen === 'workspace' && (
              <button 
                className="lg:hidden flex h-7 w-7 items-center justify-center rounded hover:bg-secondary text-muted-foreground transition-colors"
                onClick={() => setMobileChatOpen(!mobileChatOpen)}
              >
                <MessageSquare size={16} />
              </button>
            )}
          </div>
        )}
      </header>

      {/* Main Shell */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="relative flex min-h-0 flex-1 w-full"
      >
        {/* Explorer Panel */}
        <div 
          className={cn(
            "shrink-0 flex min-h-0 overflow-hidden absolute md:relative z-30 h-full shadow-2xl md:shadow-none bg-surface transition-transform duration-300 md:translate-x-0 md:flex",
            mobileExplorerOpen ? "translate-x-0" : "-translate-x-full"
          )} 
          style={{ width: leftWidth }}
        >
          <ExplorerSidebar 
            repo={repo} 
            files={files} 
            activeFile={activeFile} 
            onOpen={(f) => { openFile(f); setMobileExplorerOpen(false); }} 
            onBack={() => setScreen('library')} 
            prepare={prepare} 
            busy={busy} 
          />
        </div>

        {/* Left Resizer */}
        <div 
          className="group relative z-10 hidden w-1 shrink-0 cursor-col-resize items-center justify-center md:flex"
          onMouseDown={startLeftDrag}
        >
          <div className={`absolute inset-y-0 -left-1 -right-1 z-20`} />
          <div className={`h-full w-[1px] bg-border transition-colors group-hover:bg-accent ${isLeftDragging ? 'bg-accent' : ''}`} />
        </div>

        {/* Editor Panel */}
        <div className="flex min-h-0 flex-1 min-w-0 flex-col overflow-hidden bg-[#0d1117]">
          <EditorPanel 
            openFiles={openFiles} 
            activeFile={activeFile} 
            setActiveFile={setActiveFile} 
            closeTab={closeTab} 
            highlightedLines={[]} 
          />
        </div>

        {/* Right Resizer */}
        <div 
          className="group relative z-10 hidden w-1 shrink-0 cursor-col-resize items-center justify-center lg:flex"
          onMouseDown={startRightDrag}
        >
          <div className={`absolute inset-y-0 -left-1 -right-1 z-20`} />
          <div className={`h-full w-[1px] bg-border transition-colors group-hover:bg-accent ${isRightDragging ? 'bg-accent' : ''}`} />
        </div>

        {/* Chat Panel */}
        <div 
          className={cn(
            "shrink-0 flex min-h-0 overflow-hidden absolute lg:relative right-0 z-30 h-full shadow-2xl lg:shadow-none bg-surface transition-transform duration-300 lg:translate-x-0 lg:flex",
            mobileChatOpen ? "translate-x-0" : "translate-x-full"
          )} 
          style={{ width: rightWidth }}
        >
          <ChatPanel 
            repo={repo} 
            files={files} 
            messages={messages} 
            question={question} 
            setQuestion={setQuestion} 
            ask={ask} 
            busy={busy} 
            error={error} 
            openFile={openFile} 
          />
        </div>
      </motion.div>
    </main>
  )
}
createRoot(document.getElementById('root')).render(<App />)







