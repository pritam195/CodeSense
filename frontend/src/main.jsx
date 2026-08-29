import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { motion, AnimatePresence } from 'framer-motion'
import { Code2, Menu, MessageSquare } from 'lucide-react'
import mermaid from 'mermaid'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import TextareaAutosize from 'react-textarea-autosize'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { Navbar } from './components/ui/Navbar'
import { LandingPage } from './components/landing/LandingPage'
import { AuthModal } from './components/auth/AuthModal'
import { ProfileModal } from './components/auth/ProfileModal'
import { LibraryPage } from './components/library/LibraryPage'
import { ExplorerSidebar } from './components/workspace/ExplorerSidebar'
import { EditorPanel } from './components/workspace/EditorPanel'
import { ChatPanel } from './components/workspace/ChatPanel'
import { FileIcon } from './components/workspace/FileTree'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from './lib/utils'
import './styles.css'

const api = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

function useResizer(defaultWidth, minWidth, maxWidth, reverse = false) {
  const [width, setWidth] = useState(defaultWidth)
  const [isDragging, setIsDragging] = useState(false)

  const startDrag = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  useEffect(() => {
    if (!isDragging) return
    const onMouseMove = (e) => {
      let newWidth = reverse ? window.innerWidth - e.clientX : e.clientX
      setWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)))
    }
    const onMouseUp = () => setIsDragging(false)

    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.body.style.cursor = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [isDragging, reverse, minWidth, maxWidth])

  return [width, startDrag, isDragging]
}

function App() {
  const [uploads, setUploads] = useState([])
  const [repo, setRepo] = useState()
  const [screen, setScreen] = useState('landing') // 'landing' | 'library' | 'workspace'
  const [files, setFiles] = useState([])
  const [openFiles, setOpenFiles] = useState([])
  const [activeFile, setActiveFile] = useState(null)
  const [question, setQuestion] = useState('')
  const [gitUrl, setGitUrl] = useState('')
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [zip, setZip] = useState()
  const [initialLoading, setInitialLoading] = useState(true)
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)

  // Auth State
  const [token, setToken] = useState(() => localStorage.getItem('codesense_token'))
  const [currentUser, setCurrentUser] = useState(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState('login')
  const [profileModalOpen, setProfileModalOpen] = useState(false)

  const call = async (path, options = {}) => {
    const headers = { ...(options.headers || {}) }
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`
    }
    const response = await fetch(api + path, { ...options, headers })
    const payload = response.status === 204 ? null : await response.json()
    if (!response.ok) throw Error(payload?.detail || 'Request failed.')
    return payload
  }

  // Load Auth Session on start
  useEffect(() => {
    if (token) {
      call('/api/auth/me')
        .then(user => {
          setCurrentUser(user)
          setScreen('library')
        })
        .catch(() => {
          localStorage.removeItem('codesense_token')
          setToken(null)
          setCurrentUser(null)
        })
    }
  }, [token])

  // Load Repositories when token/auth state changes
  useEffect(() => {
    call('/api/uploads')
      .then(payload => setUploads(payload.uploads || []))
      .catch(error => setError(error.message))
      .finally(() => setInitialLoading(false))
  }, [token])

  function handleAuthSuccess(user, userToken) {
    setCurrentUser(user)
    setToken(userToken)
    localStorage.setItem('codesense_token', userToken)
    setScreen('library')
  }

  async function handleLogout() {
    try {
      if (token) {
        await call('/api/auth/logout', { method: 'POST' })
      }
    } catch {}
    localStorage.removeItem('codesense_token')
    setToken(null)
    setCurrentUser(null)
    setScreen('landing')
  }

  function openAuthModal(mode = 'login') {
    setAuthModalMode(mode)
    setAuthModalOpen(true)
  }

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

  // Choose a repository and fetch files + persisted messages from SQLite
  async function choose(item) {
    setRepo(item)
    setScreen('workspace')
    setOpenFiles([])
    setActiveFile(null)
    setMessages([])
    setError('')
    try {
      const [filePayload, msgPayload] = await Promise.all([
        call(`/api/uploads/${item.id}/files`),
        call(`/api/uploads/${item.id}/messages`).catch(() => ({ messages: [] }))
      ])
      setFiles(filePayload.files || [])
      if (filePayload.files && filePayload.files[0]) {
        openFile(filePayload.files[0])
      }
      setMessages(msgPayload.messages || [])
    } catch {
      setFiles([])
    }
  }

  async function prepare() {
    setBusy(true)
    setError('')
    try {
      let current = repo
      if (current.source_type === 'git_url') {
        await call(`/api/uploads/${current.id}/fetch`, { method: 'POST' })
        current = { ...current, source_type: 'zip' }
        setRepo(current)
        setUploads(items => items.map(item => item.id === current.id ? current : item))
      }
      for (const step of ['scan', 'parse', 'chunk', 'embed']) {
        await call(`/api/uploads/${current.id}/${step}`, { method: 'POST' })
      }
      const indexed = await call(`/api/uploads/${current.id}/files`)
      setFiles(indexed.files)
      setOpenFiles([])
      setActiveFile(null)
      if (indexed.files[0]) openFile(indexed.files[0])
      setError('')
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function ask(event, overrideQuestion) {
    if (event) event.preventDefault()
    const q = (overrideQuestion ?? question).trim()
    if (!q) return
    setQuestion('')

    if (overrideQuestion) {
      setMessages(prev => {
        const newMsgs = [...prev]
        if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === 'assistant') {
          newMsgs.pop()
        }
        return newMsgs
      })
    } else {
      setMessages(prev => [...prev, { role: 'user', content: q }])
    }

    setBusy(true)
    setError('')
    try {
      const payload = await call(`/api/uploads/${repo.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, limit: 5 })
      })
      setMessages(prev => [...prev, { role: 'assistant', content: payload.answer, ...payload }])
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function clearChat() {
    if (!repo) return
    try {
      await call(`/api/uploads/${repo.id}/messages`, { method: 'DELETE' })
      setMessages([])
    } catch (err) {
      setError(err.message)
    }
  }

  const [leftWidth, startLeftDrag, isLeftDragging] = useResizer(240, 150, 400)
  const [rightWidth, startRightDrag, isRightDragging] = useResizer(340, 250, 600, true)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Global Top Navbar */}
      <Navbar
        screen={screen}
        setScreen={setScreen}
        repo={repo}
        currentUser={currentUser}
        openAuthModal={openAuthModal}
        openProfileModal={() => setProfileModalOpen(true)}
        logout={handleLogout}
      />

      {/* Screen Views */}
      <div className="relative flex min-h-0 flex-1 w-full overflow-hidden">
        {screen === 'landing' && (
          <div className="h-full w-full overflow-y-auto">
            <LandingPage
              setScreen={setScreen}
              openAuthModal={openAuthModal}
              currentUser={currentUser}
            />
          </div>
        )}

        {screen === 'library' && (
          <div className="h-full w-full overflow-y-auto">
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
              choose={choose}
            />
          </div>
        )}

        {screen === 'workspace' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="relative flex min-h-0 flex-1 w-full"
          >
            {/* Mobile Header Controls */}
            <div className="md:hidden absolute top-2 left-2 z-40 flex items-center gap-2">
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/80 text-foreground shadow-md backdrop-blur-md"
                onClick={() => setMobileExplorerOpen(!mobileExplorerOpen)}
              >
                <Menu size={16} />
              </button>
            </div>
            <div className="lg:hidden absolute top-2 right-2 z-40 flex items-center gap-2">
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/80 text-foreground shadow-md backdrop-blur-md"
                onClick={() => setMobileChatOpen(!mobileChatOpen)}
              >
                <MessageSquare size={16} />
              </button>
            </div>

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
              <div className="absolute inset-y-0 -left-1 -right-1 z-20" />
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
              <div className="absolute inset-y-0 -left-1 -right-1 z-20" />
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
                clearChat={clearChat}
              />
            </div>
          </motion.div>
        )}
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authModalMode}
        onAuthSuccess={handleAuthSuccess}
        api={api}
        call={call}
      />

      {/* Profile Modal */}
      <ProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        currentUser={currentUser}
        onUpdateUser={updated => setCurrentUser(updated)}
        logout={handleLogout}
        call={call}
        token={token}
      />
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
