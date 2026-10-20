import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Home } from "../pages/Catalog";
import Auth from "../pages/Auth";
import Seats, { SeatMap } from "../pages/Seats";
import { Checkout, BookingDetails } from "../pages/Bookings";
import { Protected } from "../components/UI";
import { total, operationKey } from "../utils/format";
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  catalog: vi.fn(),
  login: vi.fn(),
  user: { user_id: "1", role: "USER" },
}));
vi.mock("../api/client", () => ({ api: mocks.api, catalog: mocks.catalog }));
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, loading: false, login: mocks.login }),
}));
const seats = [
  {
    show_seat_id: "1",
    seat_number: "A1",
    row: "A",
    column: 1,
    price: "10.10",
    seat_type: "STANDARD",
    status: "AVAILABLE",
  },
  {
    show_seat_id: "2",
    seat_number: "A2",
    row: "A",
    column: 2,
    price: "20.20",
    seat_type: "PREMIUM",
    status: "LOCKED",
  },
  {
    show_seat_id: "3",
    seat_number: "A3",
    row: "A",
    column: 3,
    price: "30.30",
    seat_type: "STANDARD",
    status: "BOOKED",
  },
];
const movie = {
  movie_id: "1",
  title: "Test Movie",
  language: "English",
  genre: "Drama",
  duration_minutes: 120,
  release_date: "2026-01-01",
};
const booking = {
  booking_id: "1",
  show_id: "1",
  status: "PENDING",
  movie_title: "Test Movie",
  theatre_name: "Cinema",
  location: "Mumbai",
  audi_number: 1,
  total_amount: "10.10",
  start_time: "2099-01-01T12:00:00Z",
  expires_at: "2099-01-01T12:00:00Z",
  created_at: "2026-01-01T12:00:00Z",
  seats: [seats[0]],
  payment_status: "UNPAID",
};
const catalog = {
  movies: [movie],
  theatres: [{ theatre_id: "1", theatre_name: "Cinema", location: "Mumbai" }],
  auditoriums: [],
  shows: [
    {
      show_id: "1",
      movie,
      start_time: booking.start_time,
      theatre: { theatre_name: "Cinema", location: "Mumbai" },
      auditorium: { audi_number: 1 },
    },
  ],
};
function route(component, path = "/test/1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/test/:id" element={component} />
        <Route path="/login" element={<div>Login destination</div>} />
        <Route path="/bookings/:id" element={<div>Booking destination</div>} />
        <Route path="/movies/:id" element={<div>Movie destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { user_id: "1", role: "USER" };
  mocks.catalog.mockResolvedValue(catalog);
  mocks.api.mockImplementation((path) =>
    Promise.resolve(
      path === "/config"
        ? {
            data: {
              payment_simulation: true,
              server_time: new Date().toISOString(),
            },
          }
        : path.includes("/seats")
          ? { data: seats }
          : { data: booking },
    ),
  );
});
describe("customer interface", () => {
  it("shows real catalog data and filters to an empty state", async () => {
    route(<Home />);
    expect(await screen.findByText("Test Movie")).toBeVisible();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Search movies" }),
      "missing",
    );
    expect(screen.getByText("No films found")).toBeVisible();
  });
  it("movie cards navigate to movie details", async () => {
    route(<Home />);
    await userEvent.click(
      await screen.findByRole("link", { name: /Test Movie/ }),
    );
    expect(screen.getByText("Movie destination")).toBeVisible();
  });
  it("submits login credentials and displays backend errors", async () => {
    mocks.login.mockRejectedValue(new Error("Invalid email or password"));
    route(<Auth />);
    await userEvent.type(
      screen.getByLabelText("Email address"),
      "a@example.com",
    );
    await userEvent.type(screen.getByLabelText("Password"), "password12345");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email");
    expect(mocks.login).toHaveBeenCalledWith("a@example.com", "password12345");
  });
  it("blocks unauthenticated protected routes", () => {
    mocks.user = null;
    route(
      <Protected>
        <div>Private</div>
      </Protected>,
    );
    expect(screen.getByText("Login destination")).toBeVisible();
  });
  it("does not render admin tools for customer accounts", () => {
    route(
      <Protected admin>
        <div>Secret tools</div>
      </Protected>,
    );
    expect(screen.getByText("Administrator access required")).toBeVisible();
    expect(screen.queryByText("Secret tools")).toBeNull();
  });
  it("renders accessible seat states and only permits available seats", async () => {
    const toggle = vi.fn();
    render(<SeatMap seats={seats} selected={["1"]} onToggle={toggle} />);
    expect(screen.getByRole("button", { name: /Seat A1/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Seat A2/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Seat A3/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Seat A1/ }));
    expect(toggle).toHaveBeenCalledWith("1");
  });
  it("handles a booking conflict without false confirmation", async () => {
    mocks.api.mockImplementation((path) =>
      path.includes("/locks")
        ? Promise.reject(
            Object.assign(new Error("Conflict"), {
              status: 409,
              code: "BOOKING_CONFLICT",
            }),
          )
        : Promise.resolve({ data: seats }),
    );
    route(<Seats />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Seat A1/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reserve seats" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no longer available",
    );
    expect(screen.queryByText("Booking destination")).toBeNull();
  });
  it("expired checkout cannot submit payment", async () => {
    mocks.api.mockImplementation((path) =>
      Promise.resolve(
        path === "/config"
          ? {
              data: {
                payment_simulation: true,
                server_time: new Date().toISOString(),
              },
            }
          : { data: { ...booking, status: "EXPIRED" } },
      ),
    );
    route(<Checkout />);
    expect(await screen.findByText("Your hold has expired.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Simulate payment" }),
    ).toBeNull();
  });
  it("production-disabled simulation cannot be submitted", async () => {
    mocks.api.mockImplementation((path) =>
      Promise.resolve(
        path === "/config"
          ? {
              data: {
                payment_simulation: false,
                server_time: new Date().toISOString(),
              },
            }
          : { data: booking },
      ),
    );
    route(<Checkout />);
    expect(
      await screen.findByRole("button", { name: "Simulate payment" }),
    ).toBeDisabled();
  });
  it("network retries reuse the same payment key", async () => {
    mocks.api.mockImplementation((path) =>
      path.endsWith("/payments")
        ? Promise.reject(
            Object.assign(new Error("Connection lost"), { status: 0 }),
          )
        : Promise.resolve(
            path === "/config"
              ? {
                  data: {
                    payment_simulation: true,
                    server_time: new Date().toISOString(),
                  },
                }
              : { data: booking },
          ),
    );
    route(<Checkout />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Simulate payment" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Retry payment" }),
    );
    const calls = mocks.api.mock.calls.filter(([p]) => p.endsWith("/payments"));
    expect(calls).toHaveLength(2);
    expect(calls[0][1].key).toBe(calls[1][1].key);
  });
  it("confirmation is shown only for backend-confirmed bookings", async () => {
    mocks.api.mockResolvedValue({
      data: { ...booking, status: "CONFIRMED", payment_status: "SUCCESS" },
    });
    route(<BookingDetails />);
    expect(
      await screen.findByText("You're going to the movies."),
    ).toBeVisible();
  });
  it("cancellation requires confirmation and shows refunded outcome", async () => {
    mocks.api.mockImplementation((path, options) =>
      Promise.resolve({
        data: {
          ...booking,
          status: options?.method === "POST" ? "CANCELLED" : "CONFIRMED",
          payment_status: options?.method === "POST" ? "REFUNDED" : "SUCCESS",
        },
      }),
    );
    route(<BookingDetails />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel booking" }),
    );
    expect(
      mocks.api.mock.calls.filter((c) => c[1]?.method === "POST"),
    ).toHaveLength(0);
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm cancellation" }),
    );
    expect(
      await screen.findByText(/Full simulated refund recorded/),
    ).toBeVisible();
  });
  it("adds decimal prices using integer cents", () => {
    expect(total([{ price: "0.10" }, { price: "0.20" }])).toBe("0.30");
  });
  it("persists an operation key for identical retries and rotates changed selections", () => {
    const key = operationKey("hold", "1,2");
    expect(operationKey("hold", "1,2")).toBe(key);
    expect(operationKey("hold", "2,3")).not.toBe(key);
  });
});
