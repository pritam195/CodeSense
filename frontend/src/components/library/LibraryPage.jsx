import React, { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, UploadCloud, ArrowUpDown, ChevronDown } from 'lucide-react'
import { SiGithub } from 'react-icons/si'
import { RepositoryCard } from './RepositoryCard'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { cn } from '../../lib/utils'

import { Skeleton } from '../ui/Skeleton'

export function LibraryPage({ uploads, setUploads, setRepo, setScreen, setOpenFiles, setActiveFile, setMessages, setError, error, busy, setBusy, call, initialLoading }) {
  const [zip, setZip] = useState(null)
  const [gitUrl, setGitUrl] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('newest') // newest, oldest, a-z
  const [isDragging, setIsDragging] = useState(false)

  // Handlers for generic library actions
  async function choose(item) { 
    setRepo(item); 
    setScreen('workspace'); 
    setOpenFiles([]); 
    setActiveFile(null); 
    setMessages([]); 
    setError(''); 
    try { 
      // Preheat files so workspace is ready
      await call(`/api/uploads/${item.id}/files`); 
    } catch { 
      // Do nothing, workspace handles empty files state
    } 
  }

  async function handleUpload(file) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      body.append('file', file)
      const saved = await call('/api/uploads', { method: 'POST', body })
      setUploads((await call('/api/uploads')).uploads)
      choose(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
      setZip(null)
    }
  }

  async function uploadSubmit(e) {
    e.preventDefault()
    if (zip) handleUpload(zip)
  }

  async function saveGit(e) {
    e.preventDefault()
    if (!gitUrl.trim()) return
    setBusy(true)
    setError('')
    try {
      const saved = await call('/api/uploads/git', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: gitUrl.trim() }) })
      setUploads((await call('/api/uploads')).uploads)
      setGitUrl('')
      choose(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeRepo(item) {
    if (!item || !window.confirm(`Remove ${item.original_name}? This also removes its local index.`)) return
    setBusy(true)
    setError('')
    try {
      await call(`/api/uploads/${item.id}`, { method: 'DELETE' })
      setUploads(items => items.filter(entry => entry.id !== item.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Drag and drop handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])
  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    if (busy) return
    const file = e.dataTransfer.files?.[0]
    if (file && file.name.endsWith('.zip')) {
      handleUpload(file)
    } else {
      setError("Please drop a valid .zip repository archive.")
    }
  }, [busy])

  // Sort & Filter
  const filteredUploads = useMemo(() => {
    let result = uploads.filter(u => u.original_name.toLowerCase().includes(searchQuery.toLowerCase()))
    return result.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at)
      if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
      if (sortBy === 'a-z') return a.original_name.localeCompare(b.original_name)
      return 0
    })
  }, [uploads, searchQuery, sortBy])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-background/80 px-6 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-accent">◈</span>
          <strong className="text-lg font-bold tracking-tight">CodeSense</strong>
        </div>
        <div className="h-5 w-px bg-border mx-2" />
        <span className="text-sm font-medium text-muted-foreground hidden sm:block">Repository Intelligence</span>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12 text-center md:text-left">
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">Your Workspaces</h1>
          <p className="mt-4 text-lg text-muted-foreground">Upload a repository or import from GitHub to explore code and ask grounded questions.</p>
        </motion.div>

        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-8 overflow-hidden">
            <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-danger-foreground">
              {error}
            </div>
          </motion.div>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:gap-8 mb-16">
          {/* Drag & Drop ZIP Upload */}
          <Card 
            className={cn("relative overflow-hidden transition-colors border-dashed border-2", isDragging ? 'border-accent bg-accent/5' : 'hover:border-border/80')}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <CardContent className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 rounded-full bg-secondary p-4 text-accent">
                <UploadCloud size={32} />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Upload ZIP Archive</h3>
              <p className="mb-6 text-sm text-muted-foreground">Drag and drop your project .zip file here, or click to browse.</p>
              <form onSubmit={uploadSubmit} className="w-full">
                <Input id="zip-input" type="file" accept=".zip" onChange={e => setZip(e.target.files?.[0])} className="mb-4" />
                <Button type="submit" disabled={!zip || busy} className="w-full" isLoading={busy && zip}>
                  Upload Repository
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* GitHub Import */}
          <Card>
            <CardContent className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 rounded-full bg-secondary p-4 text-foreground">
                <SiGithub size={32} />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Import from GitHub</h3>
              <p className="mb-6 text-sm text-muted-foreground">Import any public repository directly via its URL.</p>
              <form onSubmit={saveGit} className="w-full">
                <Input 
                  value={gitUrl} 
                  onChange={e => setGitUrl(e.target.value)} 
                  placeholder="https://github.com/owner/repo" 
                  type="url" 
                  required 
                  className="mb-4"
                />
                <Button type="submit" variant="secondary" disabled={!gitUrl.trim() || busy} className="w-full" isLoading={busy && !zip}>
                  Import Repository
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Repositories Section */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">Saved Repositories</h2>
              {!initialLoading && (
                <span className="flex h-6 items-center justify-center rounded-full bg-secondary px-2.5 text-xs font-medium text-muted-foreground">
                  {uploads.length}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search repositories..." 
                  className="pl-9"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  disabled={initialLoading}
                />
              </div>
              <div className="relative">
                <select 
                  className="h-9 w-[130px] appearance-none rounded-md border border-border bg-transparent px-3 py-1 pr-8 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  disabled={initialLoading}
                >
                  <option value="newest" className="bg-surface">Newest</option>
                  <option value="oldest" className="bg-surface">Oldest</option>
                  <option value="a-z" className="bg-surface">A-Z</option>
                </select>
                <ArrowUpDown className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>

          {initialLoading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => (
                <Card key={i} className="flex h-full flex-col overflow-hidden">
                  <div className="p-6 pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 w-full">
                        <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                        <div className="w-full">
                          <Skeleton className="h-5 w-3/4 mb-2" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 px-6 pb-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-3 w-12" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-3 w-10" />
                        <Skeleton className="h-4 w-12" />
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Skeleton className="h-5 w-20 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border-t border-border/50 bg-secondary/10 px-6 py-4">
                    <Skeleton className="h-9 flex-1 rounded-md" />
                    <Skeleton className="h-9 w-9 rounded-md" />
                  </div>
                </Card>
              ))}
            </div>
          ) : filteredUploads.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-secondary/20 p-8 text-center">
              <div className="mb-4 rounded-full bg-secondary/50 p-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mb-2 text-lg font-medium">No repositories found</h3>
              <p className="text-sm text-muted-foreground">
                {uploads.length === 0 ? "You haven't added any repositories yet." : "No repositories match your search criteria."}
              </p>
            </motion.div>
          ) : (
            <motion.div 
              className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.05 } }
              }}
            >
              <AnimatePresence>
                {filteredUploads.map(item => (
                  <RepositoryCard 
                    key={item.id} 
                    item={item} 
                    call={call} 
                    onChoose={choose} 
                    onRemove={removeRepo}
                    busy={busy}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  )
}
