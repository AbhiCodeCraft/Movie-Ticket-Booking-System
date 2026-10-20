import { Link, Navigate, useLocation } from "react-router-dom";
import { AlertCircle, ArrowRight, Film, LoaderCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { poster } from "../utils/format";
export function Loading() {
  return (
    <div className="state" role="status">
      <LoaderCircle className="spin" />
      Loading your cinema…
    </div>
  );
}
export function ErrorMessage({ message }) {
  return message ? (
    <div role="alert" className="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function Empty({ title = "Nothing here yet", children }) {
  return (
    <div className="state">
      <Film size={32} />
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function Resource({ resource, children }) {
  if (resource.loading && !resource.data) return <Loading />;
  if (resource.error)
    return (
      <>
        <ErrorMessage message={resource.error} />
        <button onClick={resource.reload} className="button secondary">
          Try again
        </button>
      </>
    );
  return resource.data ? children(resource.data) : null;
}
export function Protected({ admin = false, children }) {
  const { user, loading } = useAuth(),
    location = useLocation();
  if (loading) return <Loading />;
  if (!user)
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (admin && user.role !== "ADMIN")
    return (
      <Empty title="Administrator access required">
        Your account does not have permission to manage the cinema.
      </Empty>
    );
  return children;
}
export function Poster({ movie, className = "" }) {
  return (
    <img
      className={"poster " + className}
      src={poster(movie)}
      alt={`${movie.title} poster`}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.onerror = null;
        e.currentTarget.src = "/posters/0.svg";
      }}
    />
  );
}
export function MovieCard({ movie }) {
  return (
    <Link className="movie-card" to={"/movies/" + movie.movie_id}>
      <div className="poster-wrap">
        <Poster movie={movie} />
        <span className="card-tag">{movie.language}</span>
        <span className="card-action">
          Choose a screening <ArrowRight size={17} />
        </span>
      </div>
      <h3>{movie.title}</h3>
      <p>
        {movie.genre || "Cinema"} <span>·</span> {movie.duration_minutes} min
      </p>
    </Link>
  );
}
export function Status({ value }) {
  return (
    <span className={"status " + value.toLowerCase()}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function ConfirmDialog({ title, children, onConfirm, onClose, busy }) {
  return (
    <div
      className="dialog-backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onClose();
      }}
    >
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2>{title}</h2>
        <p>{children}</p>
        <div className="actions">
          <button
            autoFocus
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Keep booking
          </button>
          <button className="button danger" disabled={busy} onClick={onConfirm}>
            {busy ? "Cancelling…" : "Confirm cancellation"}
          </button>
        </div>
      </section>
    </div>
  );
}
