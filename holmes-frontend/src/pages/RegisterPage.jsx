import { Eye } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import api from '../lib/api'

function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const getErrorMessage = (error) => {
    const detail = error.response?.data?.detail

    if (Array.isArray(detail)) {
      const formatted = detail
        .map((item) => item?.msg)
        .filter(Boolean)
        .join(', ')
      if (formatted) {
        return formatted
      }
    }

    if (typeof detail === 'string' && detail.trim()) {
      return detail
    }

    return 'Unable to register.'
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const normalizedEmail = email.trim().toLowerCase()
    const normalizedPassword = password.trim()

    if (!normalizedEmail) {
      toast.error('Email is required.')
      return
    }

    if (normalizedPassword.length < 8) {
      toast.error('Password must be at least 8 characters.')
      return
    }

    if (normalizedPassword !== confirmPassword.trim()) {
      toast.error('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      await api.post('/auth/register', {
        email: normalizedEmail,
        password: normalizedPassword,
      })
      const { data } = await api.post('/auth/login', {
        email: normalizedEmail,
        password: normalizedPassword,
      })
      login(data.access_token)
      toast.success('Account created successfully.')
      navigate('/verify')
    } catch (error) {
      toast.error(getErrorMessage(error))
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

        <h1 className="mb-6 text-center text-3xl font-bold tracking-tight text-white">Create Account</h1>

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
            minLength={8}
            required
          />
          <input
            type="password"
            className="input-base"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={8}
            required
          />
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Creating Account...' : 'Register'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="text-electric-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </section>
  )
}

export default RegisterPage
