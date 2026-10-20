import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, ArrowRight } from "lucide-react";
import { api, catalog } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useResource } from "../hooks/useResource";
import { Resource, ErrorMessage, Empty } from "../components/UI";
import {
  money,
  total,
  dateTime,
  operationKey,
  clearOperation,
} from "../utils/format";
export function SeatMap({ seats, selected, onToggle }) {
  const rows = [...new Set(seats.map((s) => s.row))];
  return (
    <>
      <div className="screen">ALL EYES THIS WAY</div>
      <div className="seat-scroll">
        <div className="seat-grid">
          {rows.map((row) => (
            <div key={row} style={{ display: "contents" }}>
              <span className="row-label">{row}</span>
              <div className="seat-row">
                {seats
                  .filter((s) => s.row === row)
                  .sort((a, b) => a.column - b.column)
                  .map((s) => (
                    <button
                      key={s.show_seat_id}
                      className={`seat ${selected.includes(s.show_seat_id) ? "selected" : s.status.toLowerCase()} ${s.seat_type === "PREMIUM" ? "premium" : ""}`}
                      aria-label={`Seat ${s.seat_number}, ${s.seat_type}, ${money(s.price)}, ${s.status}`}
                      aria-pressed={selected.includes(s.show_seat_id)}
                      disabled={s.status !== "AVAILABLE"}
                      title={`${s.seat_type} · ${money(s.price)}`}
                      onClick={() => onToggle(s.show_seat_id)}
                    >
                      {s.seat_number}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="legend">
        {["Available", "Selected", "Locked", "Booked"].map((s) => (
          <span key={s}>
            <i className={"swatch " + s.toLowerCase()} />
            {s === "Locked" ? "Held" : s}
          </span>
        ))}
        <span>Violet edge: premium</span>
      </div>
    </>
  );
}
export default function Seats() {
  const { id } = useParams(),
    { user } = useAuth(),
    navigate = useNavigate(),
    [selected, setSelected] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    inflight = useRef(false);
  const r = useResource(async () => {
    const [data, inventory] = await Promise.all([
      catalog(),
      api(`/shows/${id}/seats`),
    ]);
    return {
      show: data.shows.find((s) => s.show_id === id),
      seats: inventory.data,
    };
  }, id);
  useEffect(() => {
    if (r.data)
      setSelected((old) =>
        old.filter((id) =>
          r.data.seats.some(
            (s) => s.show_seat_id === id && s.status === "AVAILABLE",
          ),
        ),
      );
  }, [r.data]);
  const scope = `hold.${user.user_id}.${id}`;
  async function reserve() {
    if (inflight.current || !selected.length) return;
    inflight.current = true;
    setBusy(true);
    setError("");
    try {
      const key = operationKey(scope, [...selected].sort().join(","));
      const result = await api(`/shows/${id}/locks`, {
        method: "POST",
        key,
        body: { seatIds: selected },
      });
      clearOperation(scope);
      navigate(
        result.data.status === "PENDING"
          ? `/checkout/${result.data.booking_id}`
          : `/bookings/${result.data.booking_id}`,
      );
    } catch (e) {
      setError(
        e.status === 409 && e.code !== "RETRYABLE_CONFLICT"
          ? "Those seats are no longer available. Availability has been refreshed; please choose again."
          : e.message,
      );
      if (e.status === 409 && e.code !== "RETRYABLE_CONFLICT") {
        clearOperation(scope);
        setSelected([]);
        r.reload();
      }
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/shows">
        <ArrowLeft size={15} />
        Back to screenings
      </Link>
      <Resource resource={r}>
        {({ show, seats }) => {
          if (!show) return <Empty title="Screening not found" />;
          const chosen = seats.filter((s) => selected.includes(s.show_seat_id));
          return (
            <>
              <div className="page-title">
                <div className="eyebrow">Your view of the story</div>
                <h1>{show.movie?.title}</h1>
                <p>
                  {show.theatre?.theatre_name} · {show.theatre?.location} ·
                  Auditorium {show.auditorium?.audi_number} ·{" "}
                  {dateTime(show.start_time)}
                </p>
              </div>
              <ErrorMessage message={error} />
              <div className="booking-layout">
                <section className="panel">
                  <div className="section-head" style={{ margin: "0 0 20px" }}>
                    <h2>Choose your seats</h2>
                    <button
                      className="icon-button"
                      aria-label="Refresh availability"
                      disabled={busy}
                      onClick={r.reload}
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                  <SeatMap
                    seats={seats}
                    selected={selected}
                    onToggle={(sid) => {
                      if (!busy)
                        setSelected((old) =>
                          old.includes(sid)
                            ? old.filter((i) => i !== sid)
                            : old.length < 20
                              ? [...old, sid]
                              : old,
                        );
                    }}
                  />
                  <p className="hint">
                    Choose up to 20 seats. The price for each seat appears in
                    its label. Seats are only held after you continue.
                  </p>
                </section>
                <aside className="panel">
                  <h2>Your selection</h2>
                  {chosen.length ? (
                    chosen.map((s) => (
                      <div className="summary-line" key={s.show_seat_id}>
                        <span>
                          {s.seat_number} · {s.seat_type}
                        </span>
                        <span>{money(s.price)}</span>
                      </div>
                    ))
                  ) : (
                    <p>Select a seat to start your night.</p>
                  )}
                  <div className="summary-line summary-total">
                    <span>Total</span>
                    <strong>{money(total(chosen))}</strong>
                  </div>
                  <button
                    className="button full"
                    onClick={reserve}
                    disabled={
                      !selected.length ||
                      busy ||
                      new Date(show.start_time) <= new Date()
                    }
                  >
                    {busy ? "Reserving…" : "Reserve seats"}
                    <ArrowRight size={16} />
                  </button>
                  <p className="hint">
                    Your seats will be held temporarily while you complete
                    checkout. Prices are confirmed by the server.
                  </p>
                </aside>
              </div>
            </>
          );
        }}
      </Resource>
    </>
  );
}
