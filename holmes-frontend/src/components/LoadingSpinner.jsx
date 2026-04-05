function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-electric-400" />
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  )
}

export default LoadingSpinner
