import { FileSearch } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useNavigate } from 'react-router-dom'
import LoadingSpinner from '../components/LoadingSpinner'
import VerdictBadge from '../components/VerdictBadge'
import api from '../lib/api'

const contentTypes = ['all', 'text', 'image', 'video', 'audio', 'url']
const verdicts = ['all', 'malicious', 'likely_manipulated', 'likely_authentic', 'undetermined']

function HistoryPage() {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [contentType, setContentType] = useState('all')
  const [verdict, setVerdict] = useState('all')
  const navigate = useNavigate()

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true)
      try {
        const { data } = await api.get('/history')
        setHistory(Array.isArray(data) ? data : [])
      } catch (error) {
        const message = error.response?.data?.detail || 'Unable to load history.'
        toast.error(Array.isArray(message) ? message.join(', ') : message)
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
  }, [])

  const filtered = useMemo(
    () =>
      history.filter((item) => {
        const matchesSearch = (item.input_reference || '')
          .toLowerCase()
          .includes(search.toLowerCase())
        const matchesType = contentType === 'all' || item.content_type === contentType
        const matchesVerdict = verdict === 'all' || item.verdict === verdict
        return matchesSearch && matchesType && matchesVerdict
      }),
    [history, search, contentType, verdict],
  )

  if (loading) {
    return <LoadingSpinner message="Loading verification history..." />
  }

  return (
    <div className="space-y-6">
      <section className="glass-card space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-white">Verification History</h1>
        <div className="grid gap-3 md:grid-cols-3">
          <input
            type="text"
            className="input-base"
            placeholder="Search by input reference"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="input-base"
            value={contentType}
            onChange={(event) => setContentType(event.target.value)}
          >
            {contentTypes.map((value) => (
              <option key={value} value={value} className="bg-navy-900">
                {value}
              </option>
            ))}
          </select>
          <select
            className="input-base"
            value={verdict}
            onChange={(event) => setVerdict(event.target.value)}
          >
            {verdicts.map((value) => (
              <option key={value} value={value} className="bg-navy-900">
                {value}
              </option>
            ))}
          </select>
        </div>
      </section>

      {filtered.length === 0 ? (
        <section className="glass-card flex flex-col items-center justify-center py-12 text-center">
          <FileSearch className="mb-3 h-8 w-8 text-slate-500" />
          <h2 className="mb-2 text-xl font-bold tracking-tight text-white">No verifications yet</h2>
          <p className="mb-5 text-slate-400">Run your first verification to see reports here.</p>
          <Link to="/verify" className="btn-primary">
            Start Verification
          </Link>
        </section>
      ) : (
        <section className="space-y-3">
          {filtered.map((item) => (
            <article key={item.id} className="glass-card">
              <div className="grid gap-3 md:grid-cols-6 md:items-center">
                <p className="text-sm text-slate-400">{new Date(item.created_at).toLocaleString()}</p>
                <span className="w-fit rounded-full bg-white/10 px-2 py-1 text-xs font-mono uppercase text-electric-400">
                  {item.content_type}
                </span>
                <p className="truncate text-sm text-slate-300 md:col-span-2">{item.input_reference || '-'}</p>
                <VerdictBadge verdict={item.verdict} className="w-fit" />
                <div className="flex items-center justify-between gap-4 md:justify-end">
                  <span className="font-mono text-sm text-electric-400">
                    {Math.round((item.confidence || 0) * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate(`/result/${item.id}`, { state: { history: item } })}
                    className="btn-ghost px-4 py-2 text-sm"
                  >
                    View Report
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}

export default HistoryPage
