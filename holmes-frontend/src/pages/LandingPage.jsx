import { Scale, ScanSearch, ShieldCheck } from 'lucide-react'
import { useRef } from 'react'
import { Link } from 'react-router-dom'

const features = [
  {
    title: 'Multi-Modal Analysis',
    description: 'Analyze text, images, video, audio, and URLs in one verification workflow.',
    icon: ScanSearch,
  },
  {
    title: 'Agent Debate',
    description: 'Defense, prosecution, and judge agents collaborate to stress test each claim.',
    icon: Scale,
  },
  {
    title: 'Full Report',
    description: 'Get tool-level findings and chain-of-reasoning instead of a single label.',
    icon: ShieldCheck,
  },
]

function LandingPage() {
  const featuresRef = useRef(null)

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="space-y-20">
      <section className="relative flex min-h-[78vh] items-center justify-center overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.14),_transparent_60%)] px-6 py-20 text-center">
        <div className="max-w-4xl">
          <p className="accent-label mb-4">AI-Powered Verification</p>
          <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-8xl">
            Truth has a new
            <br />
            defender.
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg text-slate-400">
            Holmes analyzes content across text, images, video and URLs using multi-agent AI debate to deliver verdict with full reasoning.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link to="/verify" className="btn-primary">
              Start Verifying
            </Link>
            <button type="button" onClick={scrollToFeatures} className="btn-ghost">
              See how it works
            </button>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="glass-card animate-pulse">
              <p className="text-2xl font-bold text-electric-400">5</p>
              <p className="text-sm text-slate-400">content types</p>
            </div>
            <div className="glass-card animate-pulse [animation-delay:200ms]">
              <p className="text-2xl font-bold text-electric-400">3</p>
              <p className="text-sm text-slate-400">AI agents</p>
            </div>
            <div className="glass-card animate-pulse [animation-delay:400ms]">
              <p className="text-2xl font-bold text-electric-400">4</p>
              <p className="text-sm text-slate-400">tool providers</p>
            </div>
          </div>
        </div>
      </section>

      <section ref={featuresRef} className="grid gap-6 md:grid-cols-3">
        {features.map(({ title, description, icon: Icon }) => (
          <article key={title} className="glass-card">
            <Icon className="mb-3 h-5 w-5 text-electric-400" />
            <h2 className="mb-2 text-xl font-bold tracking-tight text-white">{title}</h2>
            <p className="text-slate-400">{description}</p>
          </article>
        ))}
      </section>
    </div>
  )
}

export default LandingPage
