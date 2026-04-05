function ConfidenceBar({ confidence = 0 }) {
  const percent = Math.round((confidence || 0) * 100)

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-slate-400">Confidence</span>
        <span className="font-mono text-electric-400">{percent}%</span>
      </div>
      <progress
        max={100}
        value={Math.min(Math.max(percent, 0), 100)}
        className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-electric-400 [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:bg-electric-400"
      />
    </div>
  )
}

export default ConfidenceBar
