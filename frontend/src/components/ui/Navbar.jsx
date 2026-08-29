import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, Code2, Sparkles, User, LogIn, LogOut, 
  ChevronDown, Layers, ShieldCheck, FolderGit2,
  ExternalLink, Terminal, Laptop
} from 'lucide-react'

export function Navbar({ 
  screen, 
  setScreen, 
  repo, 
  currentUser, 
  openAuthModal, 
  openProfileModal, 
  logout 
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl transition-all">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        
        {/* Brand Logo & Breadcrumb */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setScreen(currentUser ? 'library' : 'landing')}
            className="group flex items-center gap-2 text-left focus:outline-none"
          >
            <span className="text-xl font-bold text-accent transition-transform group-hover:scale-110">◈</span>
            <strong className="text-base font-bold tracking-tight text-foreground">CodeSense</strong>
          </button>

          {/* Breadcrumbs / Subtitle */}
          <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            {screen === 'landing' && (
              <span className="font-medium text-muted-foreground">Static Codebase Intelligence</span>
            )}
            {screen === 'library' && (
              <span className="font-medium text-muted-foreground">Repository Intelligence</span>
            )}
            {screen === 'workspace' && repo && (
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => setScreen('library')}
                  className="hover:text-foreground transition-colors"
                >
                  Library
                </button>
                <span>/</span>
                <span className="truncate max-w-[220px] font-medium text-foreground">
                  {repo.original_name.split('/').pop()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex items-center gap-3">
          {screen !== 'landing' && (
            <button
              onClick={() => setScreen('landing')}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-secondary/60"
            >
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Overview
            </button>
          )}

          {screen !== 'library' && (
            <button
              onClick={() => setScreen('library')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-secondary/60"
            >
              <FolderGit2 className="h-3.5 w-3.5" />
              Repositories
            </button>
          )}

          <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />

          {/* Auth State Button */}
          {currentUser ? (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(prev => !prev)}
                className="flex items-center gap-2 rounded-full border border-border/70 bg-secondary/30 py-1 pl-1.5 pr-2.5 text-xs font-medium text-foreground hover:bg-secondary/70 transition-all focus:outline-none"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-accent font-semibold text-[11px] overflow-hidden">
                  {currentUser.avatar_url ? (
                    <img src={currentUser.avatar_url} alt={currentUser.username} className="h-full w-full object-cover" />
                  ) : (
                    currentUser.username?.charAt(0).toUpperCase() || 'U'
                  )}
                </div>
                <span className="max-w-[100px] truncate">{currentUser.username}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>

              {/* Dropdown Menu */}
              <AnimatePresence>
                {dropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40"
                      onClick={() => setDropdownOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 5 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-56 rounded-xl border border-border/80 bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl z-50"
                    >
                      <div className="px-3 py-2 border-b border-border/40 mb-1">
                        <p className="text-xs font-semibold text-foreground truncate">{currentUser.username}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{currentUser.email}</p>
                      </div>

                      <button
                        onClick={() => {
                          setDropdownOpen(false)
                          openProfileModal()
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-foreground/90 hover:bg-accent/10 hover:text-accent transition-colors"
                      >
                        <User className="h-3.5 w-3.5" />
                        User Profile & Stats
                      </button>

                      <button
                        onClick={() => {
                          setDropdownOpen(false)
                          setScreen('library')
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-foreground/90 hover:bg-accent/10 hover:text-accent transition-colors"
                      >
                        <FolderGit2 className="h-3.5 w-3.5" />
                        My Repositories
                      </button>

                      <div className="my-1 border-t border-border/40" />

                      <button
                        onClick={() => {
                          setDropdownOpen(false)
                          logout()
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign Out
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => openAuthModal('login')}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/70 transition-colors"
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign In
              </button>

              <button
                onClick={() => openAuthModal('signup')}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground shadow-sm hover:opacity-90 transition-all hover:shadow-accent/25 hover:shadow-md"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Get Started
              </button>
            </div>
          )}
        </nav>

      </div>
    </header>
  )
}
