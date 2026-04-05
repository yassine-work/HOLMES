function AgentCard({ title, icon: Icon, borderColor, content }) {
  return (
    <div className={`glass-card border-l-4 ${borderColor}`}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-electric-400" />
        <h3 className="font-semibold text-white">{title}</h3>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
        {content || 'No analysis generated.'}
      </p>
    </div>
  )
}

export default AgentCard
