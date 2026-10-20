import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  Search,
  ShieldCheck,
  Ticket,
  Clock3,
  MapPin,
} from "lucide-react";
import { catalog } from "../api/client";
import { useResource } from "../hooks/useResource";
import { MovieCard, Resource, Empty, Poster } from "../components/UI";
import { dateTime, localDay } from "../utils/format";
export function Home() {
  const r = useResource(catalog),
    [query, setQuery] = useState(""),
    [language, setLanguage] = useState(""),
    [genre, setGenre] = useState("");
  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">Your next great escape</div>
          <h1>
            A better seat.
            <br />A <em>bigger story.</em>
          </h1>
          <p>
            Switch off the everyday. Discover something extraordinary on the big
            screen.
          </p>
          <Link className="button" to="/shows">
            Find your next screening <ArrowRight size={17} />
          </Link>
          <div className="hero-foot">The lights go down. The story begins.</div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <img src="/posters/0.svg" alt="" />
          <img src="/posters/1.svg" alt="" />
        </div>
      </section>
      <div className="section-head">
        <div>
          <div className="eyebrow">On the big screen</div>
          <h2>Find your kind of cinema</h2>
          <p>New worlds, familiar feelings. There's a seat for you.</p>
        </div>
      </div>
      <Resource resource={r}>
        {(data) => {
          const films = data.movies.filter(
            (m) =>
              m.title.toLowerCase().includes(query.toLowerCase()) &&
              (!language || m.language === language) &&
              (!genre || m.genre === genre),
          );
          return (
            <>
              <div className="filters">
                <label className="search">
                  <Search size={18} />
                  <input
                    aria-label="Search movies"
                    placeholder="Search for a movie…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filter language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="">All languages</option>
                  {[...new Set(data.movies.map((m) => m.language))].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <select
                  aria-label="Filter genre"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                >
                  <option value="">All genres</option>
                  {[
                    ...new Set(data.movies.map((m) => m.genre).filter(Boolean)),
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </div>
              {films.length ? (
                <div className="movie-grid">
                  {films.map((movie) => (
                    <MovieCard key={movie.movie_id} movie={movie} />
                  ))}
                </div>
              ) : (
                <Empty title="No films found">
                  Try a different title or clear your filters.
                </Empty>
              )}
            </>
          );
        }}
      </Resource>
      <div className="feature-strip">
        <span>
          <Ticket size={18} />
          Your seat, your choice
        </span>
        <span>
          <Clock3 size={18} />
          Five minutes to make it yours
        </span>
        <span>
          <ShieldCheck size={18} />
          One seat. One booking. Always.
        </span>
      </div>
    </>
  );
}
export function ScreeningList({ data, movieId }) {
  const [location, setLocation] = useState(""),
    [day, setDay] = useState("");
  const shows = data.shows.filter(
    (s) =>
      new Date(s.start_time) > new Date() &&
      (!movieId || s.movie_id === movieId) &&
      (!location || s.theatre?.location === location) &&
      (!day || localDay(s.start_time) === day),
  );
  return (
    <>
      <div className="filters">
        <select
          aria-label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        >
          <option value="">All locations</option>
          {[...new Set(data.theatres.map((t) => t.location))].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <label className="field">
          <span>Show date (your timezone)</span>
          <input
            type="date"
            aria-label="Show date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        {day && (
          <button className="button secondary" onClick={() => setDay("")}>
            All dates
          </button>
        )}
      </div>
      {shows.length ? (
        shows.map((s) => (
          <article className="screening" key={s.show_id}>
            <div className="screening-info">
              <h3>{movieId ? s.theatre?.theatre_name : s.movie?.title}</h3>
              <p>
                <MapPin
                  size={12}
                  style={{ display: "inline", marginRight: 6 }}
                />
                {s.theatre?.theatre_name} · {s.theatre?.location} · Auditorium{" "}
                {s.auditorium?.audi_number}
              </p>
            </div>
            <div className="screening-time">{dateTime(s.start_time)}</div>
            <Link
              className="button secondary"
              to={"/shows/" + s.show_id + "/seats"}
            >
              Choose seats <ArrowRight size={15} />
            </Link>
          </article>
        ))
      ) : (
        <Empty title="No screenings found">
          Try another date or location. New shows will appear here when
          scheduled.
        </Empty>
      )}
      <p className="hint">
        Times are displayed in{" "}
        {Intl.DateTimeFormat().resolvedOptions().timeZone}. Availability is
        checked when you select seats.
      </p>
    </>
  );
}
export function MovieDetails() {
  const { id } = useParams(),
    r = useResource(catalog, id);
  return (
    <>
      <Link to="/" className="back-link">
        <ArrowLeft size={15} />
        All movies
      </Link>
      <Resource resource={r}>
        {(data) => {
          const movie = data.movies.find((m) => m.movie_id === id);
          return movie ? (
            <>
              <section className="details-hero">
                <Poster movie={movie} />
                <div>
                  <div className="eyebrow">Feature presentation</div>
                  <h1>{movie.title}</h1>
                  <p>
                    {movie.description ||
                      "Experience this story on the big screen."}
                  </p>
                  <div className="meta">
                    <span>{movie.language}</span>
                    <span>{movie.genre}</span>
                    <span>{movie.duration_minutes} min</span>
                    <span>Released {movie.release_date}</span>
                  </div>
                </div>
              </section>
              <div className="section-head">
                <h2>Choose your screening</h2>
              </div>
              <ScreeningList data={data} movieId={id} />
            </>
          ) : (
            <Empty title="Movie not found">
              This movie is no longer available.
            </Empty>
          );
        }}
      </Resource>
    </>
  );
}
export function Shows() {
  const r = useResource(catalog);
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Make a night of it</div>
        <h1>Find a screening</h1>
        <p>Your city. Your time. Your big-screen escape.</p>
      </div>
      <Resource resource={r}>
        {(data) => <ScreeningList data={data} />}
      </Resource>
    </>
  );
}
