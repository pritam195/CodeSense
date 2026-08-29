import React from 'react'
import { motion } from 'framer-motion'
import { 
  Code2, Sparkles, Search, GitBranch, Share2, 
  Terminal, ArrowRight, ShieldCheck, Zap, Layers, 
  Cpu, Database, CheckCircle2, ChevronRight, Play, 
  Flame, Lock, Box, Workflow
} from 'lucide-react'

export function LandingPage({ setScreen, openAuthModal, currentUser }) {
  const capabilities = [
    {
      icon: Search,
      title: "AST-Aware Hybrid Search",
      desc: "Combines FAISS vector embeddings with BM25 keyword matching via Reciprocal Rank Fusion (RRF, k=60) preserving entire function & class scopes.",
      color: "from-blue-500/20 to-cyan-500/20 text-cyan-400 border-cyan-500/30"
    },
    {
      icon: GitBranch,
      title: "Tree-sitter CST Call Graphs",
      desc: "Parses Python, TypeScript, and JavaScript CST to construct precise function-level call graphs in SQLite and Neo4j graph databases.",
      color: "from-purple-500/20 to-pink-500/20 text-pink-400 border-pink-500/30"
    },
    {
      icon: Workflow,
      title: "Kahn's Topo Flow Synthesis",
      desc: "Synthesizes multi-step architecture flows combining call-graph BFS and topological ordering with automatic Mermaid visual diagrams.",
      color: "from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/30"
    },
    {
      icon: ShieldCheck,
      title: "Zero Code Execution",
      desc: "Completely static analysis. Code is never evaluated, executed, or imported, protecting your infrastructure with strict isolation.",
      color: "from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30"
    }
  ]

  const pipelineSteps = [
    { step: "01", name: "Archive Scan", desc: "Fast uncompressed file metadata indexing with path sanitization." },
    { step: "02", name: "CST Extraction", desc: "Tree-sitter AST symbol parsing for functions, classes, and scopes." },
    { step: "03", name: "Hybrid Embedding", desc: "Sentence-transformers vectors & BM25 inverted index generation." },
    { step: "04", name: "Flow & Grounding", desc: "LLM synthesis with strict excerpt citations and Mermaid charts." }
  ]

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground selection:bg-accent/30 selection:text-accent">
      
      {/* Dynamic Background Glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[550px] w-[850px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-accent/20 via-primary/10 to-pink-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute top-1/3 -left-40 -z-10 h-[400px] w-[400px] rounded-full bg-cyan-500/10 blur-[120px]" />

      {/* Hero Section */}
      <section className="relative mx-auto max-w-6xl px-4 pt-20 pb-16 text-center sm:px-6 lg:pt-28">
        
        {/* Release Tag */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-medium text-accent shadow-inner backdrop-blur-md mb-8"
        >
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          <span>Next-Gen Static Codebase Intelligence</span>
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="text-muted-foreground font-mono">v0.3 Released</span>
        </motion.div>

        {/* Hero Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl"
        >
          Understand Any Codebase <br />
          <span className="bg-gradient-to-r from-accent via-cyan-400 to-pink-500 bg-clip-text text-transparent">
            Without Running a Single Line.
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg md:text-xl"
        >
          Upload a ZIP archive or paste a GitHub repository URL. CodeSense extracts AST call graphs, executes RRF hybrid retrieval, and synthesizes architectural flowcharts with grounded citations.
        </motion.p>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <button
            onClick={() => {
              if (currentUser) {
                setScreen('library')
              } else {
                openAuthModal('signup')
              }
            }}
            className="group flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground shadow-lg shadow-accent/25 hover:shadow-accent/40 hover:opacity-95 transition-all focus:outline-none"
          >
            <span>{currentUser ? "Open Repository Library" : "Start Exploring Now"}</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>

          <button
            onClick={() => setScreen('library')}
            className="flex items-center gap-2 rounded-xl border border-border/80 bg-secondary/30 px-6 py-3.5 text-sm font-medium text-foreground hover:bg-secondary/70 backdrop-blur-sm transition-all focus:outline-none"
          >
            <Play className="h-4 w-4 text-accent" />
            <span>Launch Demo Workspace</span>
          </button>
        </motion.div>

        {/* Interactive Preview Mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="relative mx-auto mt-16 max-w-5xl rounded-2xl border border-border/70 bg-secondary/15 p-2.5 shadow-2xl backdrop-blur-2xl sm:p-4"
        >
          {/* Header Mockup */}
          <div className="flex items-center justify-between border-b border-border/50 pb-3 px-2">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500/80" />
              <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
              <div className="h-3 w-3 rounded-full bg-green-500/80" />
              <span className="ml-2 text-xs font-mono text-muted-foreground">codesense-workspace — AST Call Graph & Execution Flow</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-accent bg-accent/10 px-2.5 py-0.5 rounded">
              <Zap className="h-3 w-3" /> FAISS + Tree-sitter active
            </div>
          </div>

          {/* Body Mockup Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 text-left">
            {/* Explorer Mock */}
            <div className="rounded-xl border border-border/50 bg-[#0d1117]/80 p-3 font-mono text-xs text-muted-foreground hidden md:block">
              <div className="text-[11px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <Box className="h-3.5 w-3.5 text-accent" /> AST SYMBOLS (382)
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="text-cyan-400">⚡ handle_auth_flow() [L12–88]</div>
                <div className="text-pink-400 pl-3">↳ generate_jwt_token() [L45]</div>
                <div className="text-emerald-400 pl-3">↳ verify_session_hash() [L60]</div>
                <div className="text-foreground/80">📦 UserStore.authenticate()</div>
                <div className="text-foreground/80">📦 TokenManager.create()</div>
              </div>
            </div>

            {/* Answer & Citations Mock */}
            <div className="md:col-span-2 rounded-xl border border-border/50 bg-[#0d1117]/90 p-4 font-sans text-xs">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-5 w-5 rounded bg-accent/20 text-accent flex items-center justify-center font-bold text-[10px]">
                  AI
                </div>
                <span className="font-semibold text-foreground text-xs">Execution Flow Synthesis</span>
              </div>
              <p className="text-muted-foreground leading-relaxed text-xs">
                Authentication initializes at <code className="text-cyan-300 font-mono">handle_auth_flow</code>, which executes a 2-step verification pipeline through <code className="text-pink-300 font-mono">verify_session_hash</code> and emits bearer session tokens.
              </p>
              
              {/* Citations Preview */}
              <div className="mt-3 border-t border-border/40 pt-2 flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Source Referenced</span>
                <span className="text-[10px] font-mono text-accent bg-accent/15 px-2 py-0.5 rounded border border-accent/20">
                  auth_service.py • L12–88
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Core Capabilities Section */}
      <section className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
            Engineered for Deep Code Intelligence
          </h2>
          <p className="mt-3 text-muted-foreground text-sm sm:text-base">
            Static symbol parsing, vector indexing, graph query traversal, and LLM reasoning unified in a single high-performance engine.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {capabilities.map((cap, idx) => {
            const Icon = cap.icon
            return (
              <motion.div
                key={idx}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2 }}
                className={`rounded-2xl border bg-secondary/15 p-6 backdrop-blur-xl shadow-lg hover:shadow-2xl transition-all ${cap.color}`}
              >
                <div className="flex items-center gap-3.5 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/80 shadow-sm">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">{cap.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {cap.desc}
                </p>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* Analysis Pipeline Flow */}
      <section className="border-t border-border/50 bg-secondary/10 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-mono font-bold tracking-widest text-accent uppercase">Architecture</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-1.5">
              13-Phase Static Analysis Pipeline
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {pipelineSteps.map((p, idx) => (
              <div 
                key={idx} 
                className="relative rounded-xl border border-border/60 bg-background/60 p-5 backdrop-blur-md"
              >
                <span className="font-mono text-2xl font-black text-accent/30 block mb-2">{p.step}</span>
                <h4 className="text-sm font-semibold text-foreground mb-1">{p.name}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="relative mx-auto max-w-5xl px-4 py-20 text-center sm:px-6">
        <div className="rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/15 via-secondary/20 to-background p-8 sm:p-12 backdrop-blur-2xl shadow-2xl">
          <h2 className="text-2xl sm:text-4xl font-extrabold text-foreground">
            Ready to analyze your first repository?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-xs sm:text-sm text-muted-foreground">
            Upload any source archive (.zip) or link a GitHub repo to experience instantaneous semantic code exploration.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <button
              onClick={() => {
                if (currentUser) {
                  setScreen('library')
                } else {
                  openAuthModal('signup')
                }
              }}
              className="flex items-center gap-2 rounded-xl bg-accent px-7 py-3 text-sm font-semibold text-accent-foreground shadow-lg hover:shadow-accent/30 transition-all hover:opacity-90"
            >
              <Sparkles className="h-4 w-4" />
              <span>Get Started Free</span>
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 text-center text-xs text-muted-foreground">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Code2 className="h-4 w-4 text-accent" />
            CodeSense Intelligence
          </div>
          <div>MIT License © 2026 CodeSense Contributors</div>
        </div>
      </footer>

    </div>
  )
}
