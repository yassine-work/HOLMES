import clsx from 'clsx'

function ContentTypePill({ type, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-full px-4 py-2 text-sm font-medium capitalize transition-colors',
        active ? 'bg-electric-500 text-white' : 'bg-white/5 text-slate-400 hover:text-slate-200',
      )}
    >
      {type}
    </button>
  )
}

export default ContentTypePill
