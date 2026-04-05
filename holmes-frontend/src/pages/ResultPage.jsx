import { Scale, Shield, Swords } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import AgentCard from '../components/AgentCard'
import ConfidenceBar from '../components/ConfidenceBar'
import ToolCard from '../components/ToolCard'
import VerdictBadge from '../components/VerdictBadge'

function ResultPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const history = location.state?.history

  if (!history) {
    return (
      <div className="glass-card text-center">
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-white">Result not available</h1>
        <p className="mb-6 text-slate-400">Open this report from history to view full details.</p>
        <button type="button" onClick={() => navigate('/history')} className="btn-primary">
          Go to History
        </button>
      </div>
    )
  }

  const tools = history.details?.tools || {}
  const debate = history.details?.debate || {}
  const judgeSummary = [
    debate.verdict?.label ? `Label: ${debate.verdict.label}` : null,
    typeof debate.verdict?.confidence !== 'undefined'
      ? `Confidence: ${Math.round((debate.verdict.confidence || 0) * 100)}%`
      : null,
    debate.verdict?.rationale || null,
  ]
    .filter(Boolean)
    .join('\n\n')

  return (
    <div className="space-y-8">
      <section className="glass-card space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-mono uppercase text-electric-400">
            {history.content_type}
          </span>
          <p className="max-w-full truncate text-sm text-slate-400">{history.input_reference || '-'}</p>
        </div>

        <div className="flex justify-center">
          <VerdictBadge verdict={history.verdict} className="text-sm" />
        </div>

        <ConfidenceBar confidence={history.confidence} />
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold tracking-tight text-white">Evidence Collected</h2>
        {Object.keys(tools).length === 0 ? (
          <div className="glass-card text-slate-400">No tool evidence available for this verification.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(tools).map(([toolName, toolData]) => (
              <ToolCard key={`${id}-${toolName}`} name={toolName} data={toolData} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold tracking-tight text-white">AI Agent Debate</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <AgentCard
            title="Defense"
            icon={Shield}
            borderColor="border-emerald-500"
            content={debate.defense?.content}
          />
          <AgentCard
            title="Prosecution"
            icon={Swords}
            borderColor="border-red-500"
            content={debate.prosecution?.content}
          />
          <AgentCard
            title="Judge Verdict"
            icon={Scale}
            borderColor="border-electric-500"
            content={judgeSummary || 'No verdict rationale.'}
          />
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link to="/verify" className="btn-primary text-center">
          Verify Another
        </Link>
        <Link to="/history" className="btn-ghost text-center">
          View History
        </Link>
      </div>
    </div>
  )
}

export default ResultPage
