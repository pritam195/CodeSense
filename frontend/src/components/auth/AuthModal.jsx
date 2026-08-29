import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X, Mail, Lock, User, Sparkles, LogIn, 
  ArrowRight, AlertCircle, CheckCircle2, Eye, EyeOff,
  Terminal, ShieldCheck
} from 'lucide-react'

export function AuthModal({ isOpen, onClose, initialMode = 'login', onAuthSuccess, api, call }) {
  const [mode, setMode] = useState(initialMode) // 'login' or 'signup'
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const AVATAR_OPTIONS = [
    'https://api.dicebear.com/7.x/bottts/svg?seed=Felix',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Aneka',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Zack',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Luna',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Nova',
  ]

  async function handleSubmit(e) {
    if (e) e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'signup') {
        if (!username.trim() || !email.trim() || !password.trim()) {
          throw new Error('Please fill in all required fields.')
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.')
        }

        const payload = await call('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            username: username.trim(),
            password: password,
            avatar_url: avatarUrl || AVATAR_OPTIONS[0]
          })
        })

        onAuthSuccess(payload.user, payload.token)
        onClose()
      } else {
        if (!email.trim() || !password.trim()) {
          throw new Error('Please enter your email and password.')
        }

        const payload = await call('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password: password
          })
        })

        onAuthSuccess(payload.user, payload.token)
        onClose()
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  // Quick Guest/Demo login helper
  async function handleGuestLogin() {
    setError('')
    setLoading(true)
    try {
      const guestEmail = `guest_${Math.floor(1000 + Math.random() * 9000)}@codesense.dev`
      const payload = await call('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: guestEmail,
          username: 'Guest Explorer',
          password: 'GuestPassword123!',
          avatar_url: AVATAR_OPTIONS[0]
        })
      })
      onAuthSuccess(payload.user, payload.token)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

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

        {/* Modal Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-inner">
            <Sparkles className="h-5 w-5" />
          </div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            {mode === 'login' ? 'Welcome back to CodeSense' : 'Create your CodeSense account'}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === 'login'
              ? 'Sign in to access your saved repositories and chat history.'
              : 'Start analyzing, searching, and synthesizing codebases statically.'}
          </p>
        </div>

        {/* Mode Switch Tabs */}
        <div className="mb-5 flex rounded-lg bg-secondary/50 p-1 border border-border/40 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setMode('login')
              setError('')
            }}
            className={`flex-1 rounded-md py-1.5 transition-all ${
              mode === 'login'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup')
              setError('')
            }}
            className={`flex-1 rounded-md py-1.5 transition-all ${
              mode === 'signup'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="truncate">{error}</span>
          </motion.div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'signup' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  required
                  placeholder="alex_dev"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-secondary/20 py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                required
                placeholder="developer@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border/60 bg-secondary/20 py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border/60 bg-secondary/20 py-2 pl-9 pr-9 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {mode === 'signup' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Select Avatar</label>
              <div className="flex items-center gap-2">
                {AVATAR_OPTIONS.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAvatarUrl(url)}
                    className={`h-9 w-9 rounded-full border-2 p-0.5 transition-all ${
                      (avatarUrl === url || (!avatarUrl && i === 0))
                        ? 'border-accent scale-105 shadow-md shadow-accent/20'
                        : 'border-border/60 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={url} alt="avatar" className="h-full w-full rounded-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-xs font-semibold text-accent-foreground shadow-sm hover:opacity-90 transition-all disabled:opacity-50"
          >
            {loading ? (
              <span className="animate-pulse">Authenticating...</span>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
              </>
            )}
          </button>
        </form>

        {/* Guest Demo Option */}
        <div className="mt-4 pt-4 border-t border-border/50 text-center">
          <button
            type="button"
            onClick={handleGuestLogin}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent transition-colors"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Instant 1-Click Guest Access</span>
          </button>
        </div>

      </motion.div>
    </div>
  )
}
