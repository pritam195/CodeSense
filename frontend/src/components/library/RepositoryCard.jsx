import React, { useEffect, useState, useMemo } from 'react'
import { formatBytes } from '../../lib/utils'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Skeleton } from '../ui/Skeleton'
import { Button } from '../ui/Button'
import { motion } from 'framer-motion'
import { FileArchive, FolderOpen, Trash2, Calendar, FileCode, HardDrive } from 'lucide-react'
import { SiGithub } from 'react-icons/si'

export function RepositoryCard({ item, call, onChoose, onRemove, busy }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function fetchStats() {
      try {
        const payload = await call(`/api/uploads/${item.id}/files`)
        if (!mounted) return
        
        const files = payload.files || []
        const totalSize = files.reduce((acc, f) => acc + (f.size_bytes || 0), 0)
        
        // Find most common language
        const langCounts = {}
        let mostCommon = 'Unknown'
        let maxCount = 0
        for (const f of files) {
          if (f.language) {
            langCounts[f.language] = (langCounts[f.language] || 0) + 1
            if (langCounts[f.language] > maxCount) {
              maxCount = langCounts[f.language]
              mostCommon = f.language
            }
          }
        }
        
        setStats({
          fileCount: files.length,
          size: totalSize,
          language: mostCommon
        })
      } catch (err) {
        if (mounted) {
          setStats({ fileCount: 0, size: 0, language: 'Unknown' })
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchStats()
    return () => { mounted = false }
  }, [item.id, call])

  const date = useMemo(() => new Date(item.created_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric'
  }), [item.created_at])

  const isGit = item.source_type === 'git_url'
  const isIndexed = stats?.fileCount > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="flex h-full flex-col overflow-hidden transition-colors hover:border-accent/50">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/50 text-accent">
                {isGit ? <SiGithub size={20} /> : <FileArchive size={20} />}
              </div>
              <div className="overflow-hidden">
                <CardTitle className="truncate text-base" title={item.original_name}>
                  {item.original_name}
                </CardTitle>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar size={12}/> {date}</span>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 pb-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Language</span>
              <div className="flex items-center gap-1.5">
                <FileCode size={14} className="text-muted-foreground/70" />
                {loading ? <Skeleton className="h-4 w-16" /> : <span className="font-medium">{stats.language}</span>}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Size</span>
              <div className="flex items-center gap-1.5">
                <HardDrive size={14} className="text-muted-foreground/70" />
                {loading ? <Skeleton className="h-4 w-12" /> : <span className="font-medium">{formatBytes(stats.size)}</span>}
              </div>
            </div>
          </div>
          
          <div className="mt-4 flex items-center gap-2">
            {loading ? (
              <Skeleton className="h-5 w-20 rounded-full" />
            ) : (
              <Badge variant={isIndexed ? 'default' : 'secondary'} className="text-[10px]">
                {isIndexed ? `${stats.fileCount} Files Indexed` : 'Unindexed'}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] capitalize">
              {isGit ? 'GitHub' : 'ZIP Archive'}
            </Badge>
          </div>
        </CardContent>

        <CardFooter className="flex items-center gap-2 border-t border-border/50 bg-secondary/10 px-6 py-4">
          <Button 
            className="flex-1" 
            variant="default" 
            onClick={() => onChoose(item)}
            disabled={busy}
          >
            <FolderOpen className="mr-2" size={16} /> Open
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => onRemove(item)}
            disabled={busy}
            title="Delete Repository"
            className="hover:bg-danger hover:text-danger-foreground hover:border-danger"
          >
            <Trash2 size={16} />
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  )
}
