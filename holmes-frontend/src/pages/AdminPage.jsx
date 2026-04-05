import { Activity, CheckCircle, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import LoadingSpinner from '../components/LoadingSpinner'
import { useAuth } from '../hooks/useAuth'
import api from '../lib/api'

function AdminPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const { isAdmin } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAdmin) {
      navigate('/', { replace: true })
      return
    }

    const fetchDashboard = async () => {
      setLoading(true)
      try {
        const response = await api.get('/admin/dashboard')
        setData(response.data)
      } catch (error) {
        const message = error.response?.data?.detail || 'Unable to load admin dashboard.'
        toast.error(Array.isArray(message) ? message.join(', ') : message)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [isAdmin, navigate])

  if (loading) {
    return <LoadingSpinner message="Loading admin dashboard..." />
  }

  const cards = [
    { label: 'Total Users', value: data?.total_users ?? 0, icon: Users },
    {
      label: 'Total Verifications',
      value: data?.total_verifications ?? 0,
      icon: CheckCircle,
    },
    { label: 'Total Tasks', value: data?.total_tasks ?? 0, icon: Activity },
  ]

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <article key={label} className="glass-card">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-slate-400">{label}</p>
              <Icon className="h-5 w-5 text-electric-400" />
            </div>
            <p className="text-4xl font-bold tracking-tight text-electric-400">{value}</p>
          </article>
        ))}
      </section>

      <section className="glass-card">
        <h2 className="mb-2 text-xl font-bold tracking-tight text-white">More analytics coming soon</h2>
        <p className="text-slate-400">Holmes admin insights are expanding with deeper operational metrics.</p>
      </section>
    </div>
  )
}

export default AdminPage
