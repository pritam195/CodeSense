import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  X, User, Mail, Calendar, FolderGit2, MessageSquare, 
  Files, LogOut, Check, Sparkles, Shield, RefreshCw 
} from 'lucide-react'

export function ProfileModal({ isOpen, onClose, currentUser, onUpdateUser, logout, call, token }) {
  const [username, setUsername] = useState(currentUser?.username || '')
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatar_url || '')
  const [stats, setStats] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState('')

  const AVATAR_OPTIONS = [
    'https://api.dicebear.com/7.x/bottts/svg?seed=Felix',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Aneka',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Zack',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Luna',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Nova',
  ]

  useEffect(() => {
    if (isOpen && token) {
      call('/api/auth/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(data => setStats(data))
        .catch(() => {})
    }
  }, [isOpen, token])

  if (!isOpen || !currentUser) return null

  async function handleSaveProfile(e) {
    if (e) e.preventDefault()
    if (!username.trim()) return
    setSaving(true)
    setError('')
    try {
      const updated = await call('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: username.trim(),
          avatar_url: avatarUrl
        })
      })
      onUpdateUser(updated)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      setError(err.message || 'Failed to update profile.')
    } finally {
      setSaving(false)
    }
  }

  const joinDate = currentUser.created_at 
    ? new Date(currentUser.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Active'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-background/80 backdrop-blur-md"
      />

      {/* Modal Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-2xl z-10"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Profile Header */}
        <div className="flex items-center gap-4 border-b border-border/50 pb-5 mb-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent/20 text-accent font-bold text-xl overflow-hidden border border-accent/30 shadow-inner">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              currentUser.username?.charAt(0).toUpperCase() || 'U'
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-foreground truncate">{currentUser.username}</h3>
            <p className="text-xs text-muted-foreground truncate">{currentUser.email}</p>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Calendar className="h-3 w-3 text-accent" />
              <span>Member since {joinDate}</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="mb-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border/50 bg-secondary/20 p-2.5 text-center">
              <FolderGit2 className="mx-auto h-4 w-4 text-cyan-400 mb-1" />
              <div className="text-sm font-bold text-foreground">{stats.total_repositories}</div>
              <div className="text-[10px] text-muted-foreground">Repos</div>
            </div>
            <div className="rounded-xl border border-border/50 bg-secondary/20 p-2.5 text-center">
              <MessageSquare className="mx-auto h-4 w-4 text-pink-400 mb-1" />
              <div className="text-sm font-bold text-foreground">{stats.total_questions_asked}</div>
              <div className="text-[10px] text-muted-foreground">Queries</div>
            </div>
            <div className="rounded-xl border border-border/50 bg-secondary/20 p-2.5 text-center">
              <Files className="mx-auto h-4 w-4 text-emerald-400 mb-1" />
              <div className="text-sm font-bold text-foreground">{stats.total_files_indexed}</div>
              <div className="text-[10px] text-muted-foreground">Files Indexed</div>
            </div>
          </div>
        )}

        {/* Edit Profile Form */}
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Display Name</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-secondary/20 px-3 py-2 text-xs text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">Change Avatar</label>
            <div className="flex items-center gap-2">
              {AVATAR_OPTIONS.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAvatarUrl(url)}
                  className={`h-8 w-8 rounded-full border-2 p-0.5 transition-all ${
                    avatarUrl === url
                      ? 'border-accent scale-105 shadow-md shadow-accent/20'
                      : 'border-border/60 opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={url} alt="avatar" className="h-full w-full rounded-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {error && <div className="text-xs text-destructive">{error}</div>}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => {
                onClose()
                logout()
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground shadow-sm hover:opacity-90 transition-all disabled:opacity-50"
            >
              {saveSuccess ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Saved!</span>
                </>
              ) : saving ? (
                <span>Saving...</span>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>

      </motion.div>
    </div>
  )
}
