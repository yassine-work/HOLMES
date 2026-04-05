import { Eye } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import api from '../lib/api'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)

    try {
      const { data } = await api.post('/auth/login', { email, password })
      login(data.access_token)
      toast.success('Signed in successfully.')
      const target = location.state?.from?.pathname || '/verify'
      navigate(target)
    } catch (error) {
      const message = error.response?.data?.detail || 'Unable to sign in.'
      toast.error(Array.isArray(message) ? message.join(', ') : message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="flex min-h-[70vh] items-center justify-center">
      <div className="glass-card w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Eye className="h-5 w-5 text-electric-400" />
          <p className="font-mono text-xl font-bold text-electric-400">HOLMES</p>
        </div>

        <h1 className="mb-6 text-center text-3xl font-bold tracking-tight text-white">Sign In</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            className="input-base"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            type="password"
            className="input-base"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          New to Holmes?{' '}
          <Link to="/register" className="text-electric-400 hover:underline">
            Create account
          </Link>
        </p>
      </div>
    </section>
  )
}

export default LoginPage
