import React, { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { VscChevronDown, VscChevronRight, VscFileCode, VscFolder, VscFolderOpened, VscCode } from 'react-icons/vsc'
import { SiPython, SiJavascript, SiTypescript, SiHtml5, SiCss, SiReact, SiMarkdown } from 'react-icons/si'

export const FileIcon = ({ path, className }) => {
  if (path.endsWith('.py')) return <SiPython color="#3776AB" className={className} />
  if (path.endsWith('.js')) return <SiJavascript color="#F7DF1E" className={className} />
  if (path.endsWith('.jsx')) return <SiReact color="#61DAFB" className={className} />
  if (path.endsWith('.ts')) return <SiTypescript color="#3178C6" className={className} />
  if (path.endsWith('.tsx')) return <SiReact color="#61DAFB" className={className} />
  if (path.endsWith('.html')) return <SiHtml5 color="#E34F26" className={className} />
  if (path.endsWith('.css')) return <SiCss color="#1572B6" className={className} />
  if (path.endsWith('.md')) return <SiMarkdown color="#ffffff" className={className} />
  if (path.endsWith('.json')) return <VscCode color="#cbcb41" className={className} />
  return <VscFileCode color="#8492a7" className={className} />
}

export const makeTree = (files) => {
  const root = {}
  for (const file of files) {
    let node = root
    const parts = file.path.split('/')
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        node[part] = file
      } else {
        node = node[part] ||= {}
      }
    })
  }
  return root
}

export function FileTree({ files, activeFile, onOpen, expanded, setExpanded }) {
  const root = useMemo(() => makeTree(files), [files])

  const render = (node, depth = 0, parent = '') => {
    // Sort: folders first, then files alphabetically
    const entries = Object.entries(node).sort(([a, valueA], [b, valueB]) => {
      const isFolderA = typeof valueA === 'object' && !valueA.path
      const isFolderB = typeof valueB === 'object' && !valueB.path
      return (isFolderA ? -1 : 1) - (isFolderB ? -1 : 1) || a.localeCompare(b)
    })

    return entries.map(([name, value]) => {
      const isFolder = typeof value === 'object' && !value.path
      const key = `${parent}/${name}`
      const indent = depth * 12 // VS Code uses ~12px padding per level

      if (isFolder) {
        const isOpen = expanded.has(key)
        
        return (
          <div key={key}>
            <button 
              className="flex w-full items-center gap-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
              style={{ paddingLeft: `${8 + indent}px`, paddingRight: '8px' }}
              onClick={() => {
                setExpanded(prev => {
                  const next = new Set(prev)
                  if (isOpen) next.delete(key)
                  else next.add(key)
                  return next
                })
              }}
            >
              <span className="flex h-4 w-4 items-center justify-center opacity-80">
                {isOpen ? <VscChevronDown size={14} /> : <VscChevronRight size={14} />}
              </span>
              <span className="flex items-center opacity-90">
                {isOpen ? <VscFolderOpened color="#dcb67a" size={16} /> : <VscFolder color="#dcb67a" size={16} />}
              </span>
              <span className="truncate">{name}</span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  variants={{
                    visible: { height: 'auto', opacity: 1, transition: { duration: 0.15 } },
                    hidden: { height: 0, opacity: 0, transition: { duration: 0.15 } }
                  }}
                  className="overflow-hidden"
                >
                  {render(value, depth + 1, key)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      }

      // It's a file
      const isActive = activeFile?.path === value.path
      return (
        <button 
          key={value.path} 
          className={`group flex w-full items-center gap-2 py-1 text-sm transition-colors ${isActive ? 'bg-accent/15 text-accent-foreground' : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground'}`}
          style={{ paddingLeft: `${28 + indent}px`, paddingRight: '8px' }}
          onClick={() => onOpen(value)}
        >
          <span className="flex h-4 w-4 items-center justify-center opacity-90 group-hover:opacity-100">
            <FileIcon path={value.path} className="h-full w-full" />
          </span>
          <span className="truncate">{name}</span>
        </button>
      )
    })
  }

  return <nav className="flex flex-col py-2">{render(root)}</nav>
}
