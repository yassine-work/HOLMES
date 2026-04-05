import { Database, Globe, Search, Shield } from 'lucide-react'

const iconMap = {
  sightengine: Shield,
  zenserp: Search,
  virustotal: Globe,
  ninja: Database,
}

const statusStyles = {
  ok: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  skipped: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
  error: 'bg-red-500/20 text-red-400 border border-red-500/30',
  degraded: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
}

function ToolCard({ name, data }) {
  const Icon = iconMap[name] || Database
  const status = data?.status || 'skipped'
  const organicResultsCount = Array.isArray(data?.organic_results)
    ? data.organic_results.length
    : typeof data?.organic_results === 'number'
      ? data.organic_results
      : null
  const manipulationScore =
    data?.data?.manipulation_score ??
    data?.data?.type?.deepfake ??
    data?.data?.type?.ai_generated ??
    null

  return (
    <div className="glass-card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-electric-400" />
          <h4 className="font-semibold capitalize text-white">{name}</h4>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-xs font-mono uppercase ${statusStyles[status] || statusStyles.skipped}`}
        >
          {status}
        </span>
      </div>
      <p className="text-sm text-slate-400">{data?.summary || 'No summary available.'}</p>
      <dl className="space-y-2 text-sm text-slate-300">
        {manipulationScore !== null && typeof manipulationScore !== 'undefined' && (
          <div className="flex justify-between gap-4">
            <dt className="text-slate-400">Manipulation Score</dt>
            <dd className="font-mono">{manipulationScore}</dd>
          </div>
        )}
        {typeof data?.analysis_stats?.malicious !== 'undefined' && (
          <div className="flex justify-between gap-4">
            <dt className="text-slate-400">Malicious Detections</dt>
            <dd className="font-mono">{data.analysis_stats.malicious}</dd>
          </div>
        )}
        {organicResultsCount !== null && (
          <div className="flex justify-between gap-4">
            <dt className="text-slate-400">Organic Results</dt>
            <dd className="font-mono">{organicResultsCount}</dd>
          </div>
        )}
        {typeof data?.domain_age_days !== 'undefined' && (
          <div className="flex justify-between gap-4">
            <dt className="text-slate-400">Domain Age</dt>
            <dd className="font-mono">{data.domain_age_days} days</dd>
          </div>
        )}
        {Array.isArray(data?.risk_flags) && data.risk_flags.length > 0 && (
          <div>
            <dt className="mb-1 text-slate-400">Risk Flags</dt>
            <dd className="flex flex-wrap gap-2">
              {data.risk_flags.map((flag) => (
                <span
                  key={flag}
                  className="rounded-full border border-orange-500/30 bg-orange-500/20 px-2 py-0.5 text-xs font-mono text-orange-300"
                >
                  {flag}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}

export default ToolCard
