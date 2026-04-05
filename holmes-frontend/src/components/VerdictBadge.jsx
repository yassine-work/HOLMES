import clsx from 'clsx'

const verdictStyles = {
  malicious: 'bg-red-500/20 text-red-400 border border-red-500/30',
  likely_manipulated: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  likely_authentic: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  undetermined: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
}

function VerdictBadge({ verdict, className = '' }) {
  const normalized = verdict || 'undetermined'

  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-3 py-1 text-xs font-mono font-semibold uppercase tracking-wide',
        verdictStyles[normalized] || verdictStyles.undetermined,
        className,
      )}
    >
      {normalized.replaceAll('_', ' ')}
    </span>
  )
}

export default VerdictBadge
