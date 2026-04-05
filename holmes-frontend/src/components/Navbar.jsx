import { Eye, LogOut } from 'lucide-react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

function Navbar() {
  const { token, logout, isAdmin } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-navy-900/80 backdrop-blur">
      <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-electric-400" />
          <span className="font-mono text-xl font-bold text-electric-400">HOLMES</span>
        </Link>

        <div className="flex items-center gap-3">
          {token ? (
            <>
              <NavLink
                to="/verify"
                className={({ isActive }) =>
                  `text-sm ${isActive ? 'text-electric-400' : 'text-slate-300 hover:text-white'}`
                }
              >
                Verify
              </NavLink>
              <NavLink
                to="/history"
                className={({ isActive }) =>
                  `text-sm ${isActive ? 'text-electric-400' : 'text-slate-300 hover:text-white'}`
                }
              >
                History
              </NavLink>
              {isAdmin && (
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    `text-sm ${isActive ? 'text-electric-400' : 'text-slate-300 hover:text-white'}`
                  }
                >
                  Admin
                </NavLink>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-white hover:border-electric-400"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm text-slate-300 hover:text-white">
                Login
              </Link>
              <Link to="/register" className="btn-primary py-2 text-sm">
                Register
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

export default Navbar
