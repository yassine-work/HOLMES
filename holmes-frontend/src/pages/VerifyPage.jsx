import { Clock4, History } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import ContentTypePill from '../components/ContentTypePill'
import LoadingSpinner from '../components/LoadingSpinner'
import VerdictBadge from '../components/VerdictBadge'
import api from '../lib/api'

const contentTypes = ['text', 'image', 'video', 'audio', 'url']

function timeAgo(isoDate) {
  const date = new Date(isoDate)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function VerifyPage() {
  const [contentType, setContentType] = useState('text')
  const [content, setContent] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [history, setHistory] = useState([])
  const navigate = useNavigate()

  const placeholder = useMemo(() => {
    if (contentType === 'text') return 'Paste text content to analyze...'
    return 'https://example.com/content'
  }, [contentType])

  const fileAccept = useMemo(() => {
    if (contentType === 'image') return 'image/*'
    if (contentType === 'video') return 'video/*'
    if (contentType === 'audio') return 'audio/*'
    return ''
  }, [contentType])

  const isFileType = ['image', 'video', 'audio'].includes(contentType)

  const fetchHistory = async () => {
    setHistoryLoading(true)
    try {
      const { data } = await api.get('/history')
      setHistory(Array.isArray(data) ? data.slice(0, 3) : [])
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isFileType) {
      if (!selectedFile) {
        toast.error('Please select a file to verify.')
        return
      }
    } else if (!content.trim()) {
      toast.error('Please enter content to verify.')
      return
    }

    setLoading(true)
    try {
      let data

      if (isFileType) {
        const formData = new FormData()
        formData.append('content_type', contentType)
        formData.append('file', selectedFile)

        const response = await api.post('/upload/verify-file', formData)
        data = response.data
      } else {
        const payload = {
          content_type: contentType,
          content,
        }

        try {
          const response = await api.post('/upload/verify', payload)
          data = response.data
        } catch (error) {
          if (error.response?.status !== 404) {
            throw error
          }
          const fallback = await api.post('/verify', payload)
          data = fallback.data
        }
      }

      toast.success('Verification completed.')
      navigate(`/result/${data.id}`, { state: { history: data } })
      setContent('')
      setSelectedFile(null)
    } catch (error) {
      const message = error.response?.data?.detail || 'Verification failed.'
      toast.error(Array.isArray(message) ? message.join(', ') : message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="glass-card">
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-white">Submit for Verification</h1>
        <p className="mb-5 text-slate-400">Choose a content type and run Holmes analysis.</p>

        <div className="mb-5 flex flex-wrap gap-2">
          {contentTypes.map((type) => (
            <ContentTypePill
              key={type}
              type={type}
              active={type === contentType}
              onClick={() => {
                setContentType(type)
                setSelectedFile(null)
                setContent('')
              }}
            />
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {contentType === 'text' ? (
            <textarea
              rows={4}
              className="input-base"
              placeholder={placeholder}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              required
            />
          ) : isFileType ? (
            <div className="space-y-2">
              <input
                type="file"
                className="input-base file:mr-4 file:rounded-lg file:border-0 file:bg-electric-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                accept={fileAccept}
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                required
              />
              {selectedFile && (
                <p className="text-sm text-slate-400">
                  Selected: <span className="font-mono text-electric-400">{selectedFile.name}</span>
                </p>
              )}
            </div>
          ) : (
            <input
              type="text"
              className="input-base"
              placeholder={placeholder}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              required
            />
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Running verification pipeline...' : 'Analyze Content'}
          </button>
        </form>

        {loading && <LoadingSpinner message="Running verification pipeline..." />}
      </div>

      <div className="glass-card">
        <div className="mb-5 flex items-center gap-2">
          <History className="h-5 w-5 text-electric-400" />
          <h2 className="text-xl font-bold tracking-tight text-white">Recent Verifications</h2>
        </div>

        {historyLoading ? (
          <LoadingSpinner message="Loading recent history..." />
        ) : history.length === 0 ? (
          <p className="text-slate-400">No recent verifications yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map((item) => (
              <article key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-mono uppercase text-electric-400">
                    {item.content_type}
                  </span>
                  <VerdictBadge verdict={item.verdict} />
                </div>
                <p className="truncate text-sm text-slate-300">{item.input_reference || '-'}</p>
                <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <Clock4 className="h-3.5 w-3.5" />
                  {timeAgo(item.created_at)}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export default VerifyPage
