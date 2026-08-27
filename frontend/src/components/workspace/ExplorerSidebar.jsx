import React, { useState, useMemo, useEffect } from 'react'
import { FileTree } from './FileTree'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Search, ChevronLeft, FoldVertical, UnfoldVertical, Database } from 'lucide-react'
import { formatBytes } from '../../lib/utils'

export function ExplorerSidebar({ repo, files, activeFile, onOpen, onBack, prepare, busy }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expanded, setExpanded] = useState(new Set())
  const [repoSize, setRepoSize] = useState(0)

  // Calculate some basic repo stats
  useEffect(() => {
    const size = files.reduce((acc, f) => acc + (f.size_bytes || 0), 0)
    setRepoSize(size)
  }, [files])

  // Filter files based on search
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files
    const query = searchQuery.toLowerCase()
    return files.filter(f => f.path.toLowerCase().includes(query))
  }, [files, searchQuery])

  // Auto-expand parents of matched files during search
  useEffect(() => {
    if (!searchQuery.trim() || filteredFiles.length === 0) return
    const newExpanded = new Set(expanded)
    filteredFiles.forEach(file => {
      const parts = file.path.split('/')
      let currentPath = ''
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath += (i === 0 ? '' : '/') + parts[i]
        newExpanded.add(`/${currentPath}`)
      }
    })
    setExpanded(newExpanded)
  }, [searchQuery, filteredFiles]) // run when search results change

  const collapseAll = () => setExpanded(new Set())
  const expandAll = () => {
    const newExpanded = new Set()
    files.forEach(file => {
      const parts = file.path.split('/')
      let currentPath = ''
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath += (i === 0 ? '' : '/') + parts[i]
        newExpanded.add(`/${currentPath}`)
      }
    })
    setExpanded(newExpanded)
  }

  const needsPrepare = files.length === 0

  return (
    <aside className="flex h-full w-full min-w-[200px] flex-col border-r border-border bg-surface text-foreground overflow-hidden">
      {/* Sticky Header Section */}
      <div className="flex flex-col border-b border-border bg-surface">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Explorer</span>
          <button 
            title="Back to repository library" 
            onClick={onBack}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent/10 hover:text-accent transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
        
        {repo && (
          <div className="px-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Database size={14} className="text-accent" />
              <strong className="truncate text-sm font-semibold">{repo.original_name}</strong>
            </div>
            
            {!needsPrepare && (
              <div className="mb-3 flex items-center gap-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                <span>{files.length} Files</span>
                <span>•</span>
                <span>{formatBytes(repoSize, 0)}</span>
              </div>
            )}
            
            <Button 
              variant={needsPrepare ? "default" : "outline"}
              className="w-full text-xs h-8"
              onClick={prepare}
              isLoading={busy}
            >
              {needsPrepare 
                ? (repo.source_type === 'git_url' ? 'Fetch & Prepare' : 'Prepare Repository') 
                : 'Re-index Repository'}
            </Button>
          </div>
        )}
      </div>

      {/* Explorer Tools (Search & Collapse) */}
      {!needsPrepare && repo && (
        <div className="flex flex-col border-b border-border/50 p-2 gap-2 bg-background/30">
          <div className="relative">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="h-7 w-full pl-7 text-xs bg-background"
            />
          </div>
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Files</span>
            <div className="flex gap-1">
              <button onClick={collapseAll} title="Collapse All" className="rounded p-1 text-muted-foreground hover:bg-accent/10 hover:text-accent">
                <FoldVertical size={14} />
              </button>
              <button onClick={expandAll} title="Expand All" className="rounded p-1 text-muted-foreground hover:bg-accent/10 hover:text-accent">
                <UnfoldVertical size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tree Scroll Area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {needsPrepare ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground mt-8">
            <div className="mb-3 rounded-full bg-secondary/50 p-3">
              <Database size={20} className="text-muted-foreground/70" />
            </div>
            <p className="text-xs font-medium">Repository not indexed</p>
            <p className="text-[11px] mt-1 opacity-70">Click 'Prepare Repository' to begin exploring files.</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground mt-4">
            <Search size={20} className="mb-2 text-muted-foreground/50" />
            <p className="text-xs font-medium">No files found</p>
            <p className="text-[11px] mt-1 opacity-70">Try adjusting your search query.</p>
          </div>
        ) : (
          <FileTree 
            files={filteredFiles} 
            activeFile={activeFile} 
            onOpen={onOpen}
            expanded={expanded}
            setExpanded={setExpanded}
          />
        )}
      </div>
    </aside>
  )
}
