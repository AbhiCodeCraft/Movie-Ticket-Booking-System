import { Link, NavLink, Outlet } from "react-router-dom";
import { Clapperboard, LogOut, Ticket } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
export default function Layout() {
  const { user, logout, notice, setNotice } = useAuth();
  return (
    <>
      <header className="site-header">
        <div className="nav-inner">
          <Link to="/" className="brand" aria-label="Frame home">
            <Clapperboard />
            FRAME<span>CINEMA</span>
          </Link>
          <nav aria-label="Main navigation">
            <NavLink to="/" end>
              Discover
            </NavLink>
            <NavLink to="/shows">Screenings</NavLink>
            {user && <NavLink to="/bookings">My bookings</NavLink>}
            {user?.role === "ADMIN" && (
              <NavLink to="/admin">Studio admin</NavLink>
            )}
          </nav>
          <div className="account">
            {user ? (
              <>
                <span className="username">{user.name}</span>
                <button
                  aria-label="Sign out"
                  className="icon-button"
                  onClick={logout}
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <Link className="button small" to="/login">
                Sign in <Ticket size={16} />
              </Link>
            )}
          </div>
        </div>
      </header>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      <main className="container">
        <Outlet />
      </main>
      <footer>
        <Link to="/" className="brand">
          <Clapperboard size={20} />
          FRAME
        </Link>
        <p>Good stories deserve a big screen.</p>
        <small>Portfolio demo · Simulated payments only</small>
      </footer>
    </>
  );
}
