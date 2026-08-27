import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ChevronRight, Copy, Check, Code2, X } from 'lucide-react'
import { FileIcon } from './FileTree'
import { cn } from '../../lib/utils'

export function EditorPanel({ openFiles, activeFile, setActiveFile, closeTab, highlightedLines = [] }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!activeFile?.content) return
    try {
      await navigator.clipboard.writeText(activeFile.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy', err)
    }
  }

  const tabLabel = (file) => {
    const base = file.path.split('/').at(-1)
    const siblings = openFiles.filter(f => f.path.split('/').at(-1) === base)
    if (siblings.length < 2) return { name: base, dir: null }
    const parts = file.path.split('/')
    return { name: base, dir: parts.length > 1 ? parts.at(-2) : null }
  }

  // Handle syntax highlighter dynamic line props for citations/highlights
  const getLineProps = (lineNumber) => {
    let style = { display: 'block' }
    if (highlightedLines.includes(lineNumber)) {
      style.backgroundColor = 'rgba(59, 130, 246, 0.15)' // subtle accent background
      style.borderLeft = '3px solid #3b82f6'
      style.paddingLeft = '5px' // compensate for border to keep alignment
    } else {
      style.borderLeft = '3px solid transparent'
      style.paddingLeft = '5px'
    }
    return { style }
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-[#0d1117]">
      {/* Sticky Tab Bar */}
      <div className="flex h-10 w-full flex-shrink-0 items-end overflow-x-auto overflow-y-hidden border-b border-border bg-[#010409] scrollbar-none">
        {openFiles.length === 0 ? (
          <span className="px-4 py-2 text-xs text-muted-foreground italic">No open files</span>
        ) : (
          openFiles.map(file => {
            const isActive = activeFile?.path === file.path
            const { name, dir } = tabLabel(file)
            return (
              <div
                key={file.path}
                className={cn(
                  "group flex h-9 min-w-[120px] max-w-[200px] cursor-pointer items-center gap-2 border-r border-border px-3 text-[13px] transition-colors select-none",
                  isActive 
                    ? "border-t-2 border-t-accent bg-[#0d1117] text-foreground" 
                    : "border-t-2 border-t-transparent bg-transparent text-muted-foreground hover:bg-[#161b22] hover:text-foreground"
                )}
                onClick={() => setActiveFile(file)}
                title={file.path}
              >
                <span className="flex items-center justify-center opacity-80 group-hover:opacity-100">
                  <FileIcon path={file.path} className="h-4 w-4" />
                </span>
                <span className="flex-1 truncate">
                  {dir ? <><span className="opacity-50">{dir} /</span> {name}</> : name}
                </span>
                <button
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground",
                    !isActive && "opacity-0 group-hover:opacity-100"
                  )}
                  onClick={(e) => closeTab(file, e)}
                  title="Close"
                >
                  <X size={14} />
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Editor Content Area */}
      <div className="flex min-h-0 flex-1 flex-col">
        {activeFile ? (
          <>
            {/* Breadcrumb Header */}
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/50 bg-[#0d1117] px-4">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {activeFile.path.split('/').map((segment, index, arr) => (
                  <React.Fragment key={index}>
                    <span className={cn("truncate", index === arr.length - 1 && "text-foreground font-medium")}>
                      {segment}
                    </span>
                    {index < arr.length - 1 && <ChevronRight size={14} className="opacity-50" />}
                  </React.Fragment>
                ))}
              </div>
              
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded bg-secondary/50 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            {/* Syntax Highlighter */}
            <div className="flex-1 overflow-auto bg-[#0d1117]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeFile.path}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="min-h-full"
                >
                  <SyntaxHighlighter
                    language={activeFile.path.split('.').pop() || 'text'}
                    style={vscDarkPlus}
                    showLineNumbers={true}
                    wrapLines={true}
                    lineProps={getLineProps}
                    customStyle={{
                      margin: 0,
                      padding: '16px 0',
                      backgroundColor: 'transparent',
                      fontSize: '13.5px',
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
                      lineHeight: '1.6'
                    }}
                    lineNumberStyle={{
                      minWidth: '3.5em',
                      paddingRight: '1em',
                      color: '#4b5563',
                      textAlign: 'right',
                      userSelect: 'none'
                    }}
                  >
                    {activeFile.content || ' '}
                  </SyntaxHighlighter>
                </motion.div>
              </AnimatePresence>
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-secondary/30 shadow-inner">
              <Code2 size={40} className="text-accent opacity-80" />
            </div>
            <span className="text-xl font-bold text-foreground">CodeSense</span>
            <p className="mt-2 text-sm max-w-[250px] text-center leading-relaxed">
              Select a file from the explorer to view its contents.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
