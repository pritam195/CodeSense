import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import mermaid from 'mermaid'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import TextareaAutosize from 'react-textarea-autosize'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Send, Square, Check, Copy, Sparkles, Bot, User, RefreshCcw, ArrowRight } from 'lucide-react'
import { FileIcon } from './FileTree'
import { cn } from '../../lib/utils'

// Initialize Mermaid
mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' })

function MermaidDiagram({ chart }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current || !chart) return
    const id = 'mermaid-' + Math.random().toString(36).slice(2)
    
    // Clean up chart syntax
    let cleanChart = chart
      .replace(/^```[a-zA-Z]*\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
    
    cleanChart = cleanChart.replace(/(-->|-\.->|==>|---|===|-.-)\s*\|([^|]+)\|/g, (match, arrow, p1) => {
      const trimmed = p1.trim()
      if (!trimmed.startsWith('"') && !trimmed.endsWith('"')) {
        return `${arrow}|"${trimmed}"|`
      }
      return match
    })

    mermaid.render(id, cleanChart).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg
    }).catch(err => {
      if (ref.current) ref.current.innerHTML = `<pre style="color:#f87171;white-space:pre-wrap">${chart}</pre>`
      console.error('Mermaid render error:', err)
    })
  }, [chart])
  return <div ref={ref} className="overflow-auto rounded-md bg-secondary/20 p-4" />
}

const CodeBlock = ({ node, inline, className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : 'text'
  const code = String(children).replace(/\n$/, '')
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (inline || !match) {
    return (
      <code {...props} className={cn("rounded bg-secondary/50 px-1.5 py-0.5 font-mono text-[13px]", className)}>
        {children}
      </code>
    )
  }

  return (
    <div className="my-4 overflow-hidden rounded-md border border-border/50 bg-[#0d1117]">
      <div className="flex items-center justify-between bg-secondary/30 px-4 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded p-1 hover:bg-white/10 hover:text-foreground transition-colors"
        >
          {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        {...props}
        PreTag="div"
        language={language}
        style={vscDarkPlus}
        customStyle={{ margin: 0, padding: '16px', fontSize: '13px', backgroundColor: 'transparent' }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

function CitationCard({ citation, files, openFile }) {
  const file = files.find(f => f.path === citation.path)
  
  return (
    <button
      onClick={() => openFile && file && openFile(file)}
      className="flex items-start gap-3 rounded-lg border border-border/50 bg-secondary/10 p-3 text-left transition-colors hover:bg-accent/10 hover:border-accent/30 w-full mb-2"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary/50">
        <FileIcon path={citation.path} className="h-5 w-5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{citation.path.split('/').pop()}</span>
        <span className="truncate text-xs text-muted-foreground">
          {citation.path} • Lines {citation.start_line}–{citation.end_line}
        </span>
      </div>
    </button>
  )
}

function AnswerBlock({ answer }) {
  if (!answer) return null
  const fmt = answer.format ?? 'text'
  
  if (fmt === 'mermaid') {
    return (
      <div className="my-2">
        <MermaidDiagram chart={answer.answer} />
      </div>
    )
  }
  
  if (fmt === 'markdown') {
    return (
      <div className="prose prose-invert prose-sm max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code: CodeBlock,
            a: ({node, ...props}) => <a {...props} className="text-accent hover:underline" target="_blank" rel="noopener noreferrer" />,
            p: ({node, ...props}) => <p {...props} className="mb-4 leading-relaxed last:mb-0" />,
            ul: ({node, ...props}) => <ul {...props} className="mb-4 list-disc pl-4 last:mb-0" />,
            ol: ({node, ...props}) => <ol {...props} className="mb-4 list-decimal pl-4 last:mb-0" />,
          }}
        >
          {answer.answer}
        </ReactMarkdown>
      </div>
    )
  }
  
  return <p className="whitespace-pre-wrap leading-relaxed text-sm">{answer.answer}</p>
}

export function ChatPanel({ repo, files, messages, question, setQuestion, ask, busy, error, openFile }) {
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, busy])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!busy && question.trim()) {
        ask(e)
      }
    }
  }

  const repoName = repo?.original_name?.split('/').pop() || 'this repository';

  const handleRegenerate = () => {
    if (busy) return
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (lastUserMsg) {
      ask(null, lastUserMsg.content)
    }
  }

  const suggestedPrompts = [
    "Explain the architecture",
    "Where is the entry point?",
    "How is state managed?"
  ]

  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-surface shadow-2xl z-10">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-border/50 px-4 bg-background shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CodeSense AI</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
          </span>
          <span className="text-[10px] text-muted-foreground uppercase">Ready</span>
        </div>
      </div>

      {/* Chat History */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {error && (
          <div className="mb-4 rounded-md border border-danger/50 bg-danger/10 p-3 text-sm text-danger-foreground">
            {error}
          </div>
        )}

        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Bot size={24} />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-foreground">How can I help?</h2>
            <p className="max-w-[250px] text-xs leading-relaxed mb-8">
              Ask about architecture, data flows, or specific implementations in <strong className="text-foreground font-medium">{repoName}</strong>.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-[260px]">
              {suggestedPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => ask(null, prompt)}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 px-4 py-2.5 text-xs text-foreground transition-colors hover:bg-secondary/40 hover:border-accent/30"
                >
                  {prompt}
                  <ArrowRight size={14} className="text-muted-foreground opacity-50" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6 pb-4">
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => {
                const isLastAssistant = idx === messages.length - 1 && msg.role === 'assistant';
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex flex-col gap-2 max-w-full",
                      msg.role === 'user' ? "items-end" : "items-start"
                    )}
                  >
                    {msg.role === 'user' ? (
                      <div className="flex items-start gap-2 max-w-[90%]">
                        <div className="rounded-2xl rounded-tr-sm bg-accent/90 px-4 py-2.5 text-sm text-accent-foreground shadow-sm">
                          {msg.content}
                        </div>
                        <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                          <User size={14} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col w-full group">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent">
                            <Bot size={14} />
                          </div>
                          <span className="text-xs font-medium text-foreground">CodeSense</span>
                        </div>
                        
                        <div className="text-foreground pl-8">
                          <AnswerBlock answer={msg} />
                          
                          {msg.citations && msg.citations.length > 0 && (
                            <div className="mt-4 border-t border-border/50 pt-4">
                              <span className="mb-3 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Sources Referenced
                              </span>
                              <div className="flex flex-col gap-1">
                                {msg.citations.map((cit, i) => (
                                  <CitationCard 
                                    key={i} 
                                    citation={cit} 
                                    files={files} 
                                    openFile={openFile} 
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {isLastAssistant && !busy && (
                            <div className="mt-2 flex items-center justify-start opacity-0 transition-opacity group-hover:opacity-100">
                              <button 
                                onClick={handleRegenerate}
                                className="flex items-center gap-1.5 rounded p-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                              >
                                <RefreshCcw size={13} />
                                Regenerate
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>

            {/* Thinking Animation */}
            {busy && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col w-full"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent">
                    <Bot size={14} />
                  </div>
                  <span className="text-xs font-medium text-foreground">CodeSense</span>
                </div>
                <div className="pl-8 flex items-center gap-1.5 h-8">
                  <motion.div
                    className="h-2 w-2 rounded-full bg-accent"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                  />
                  <motion.div
                    className="h-2 w-2 rounded-full bg-accent"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                  />
                  <motion.div
                    className="h-2 w-2 rounded-full bg-accent"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                  />
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border/50 bg-background/50 p-4 backdrop-blur shrink-0">
        <form onSubmit={ask} className="relative flex flex-col rounded-xl border border-border/50 bg-surface focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/50 transition-all shadow-sm">
          <TextareaAutosize
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={repo ? 'Ask anything...' : 'Select a repository first'}
            disabled={!repo || busy}
            minRows={1}
            maxRows={6}
            className="w-full resize-none bg-transparent p-3 pr-12 pb-8 text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="absolute bottom-2 left-3 flex items-center">
             <span className="text-[10px] text-muted-foreground/60 hidden sm:inline-block">
               <kbd className="font-sans px-1 rounded bg-background/50 border border-border/50">Enter</kbd> to send, <kbd className="font-sans px-1 rounded bg-background/50 border border-border/50">Shift+Enter</kbd> for new line
             </span>
          </div>
          <div className="absolute bottom-2 right-2 flex items-center gap-2">
            {busy ? (
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-danger/10 text-danger transition-colors hover:bg-danger hover:text-white"
                title="Stop generating (Frontend cancellation)"
              >
                <Square size={14} className="fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!repo || !question.trim()}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50 disabled:hover:bg-accent"
                title="Send message"
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </form>
      </div>
    </aside>
  )
}
