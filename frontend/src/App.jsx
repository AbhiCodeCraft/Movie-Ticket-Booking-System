import { Routes, Route } from "react-router-dom";
import Layout from "./layouts/Layout";
import { Home, MovieDetails, Shows } from "./pages/Catalog";
import Auth from "./pages/Auth";
import { Protected, Empty } from "./components/UI";
import Seats from "./pages/Seats";
import { Checkout, BookingDetails, Bookings } from "./pages/Bookings";
import Admin from "./pages/Admin";
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="movies/:id" element={<MovieDetails />} />
        <Route path="shows" element={<Shows />} />
        <Route path="login" element={<Auth />} />
        <Route path="register" element={<Auth register />} />
        <Route
          path="shows/:id/seats"
          element={
            <Protected>
              <Seats />
            </Protected>
          }
        />
        <Route
          path="checkout/:id"
          element={
            <Protected>
              <Checkout />
            </Protected>
          }
        />
        <Route
          path="bookings"
          element={
            <Protected>
              <Bookings />
            </Protected>
          }
        />
        <Route
          path="bookings/:id"
          element={
            <Protected>
              <BookingDetails />
            </Protected>
          }
        />
        <Route
          path="admin"
          element={
            <Protected admin>
              <Admin />
            </Protected>
          }
        />
        <Route
          path="*"
          element={
            <Empty title="Page not found">
              Use the navigation to return to the cinema.
            </Empty>
          }
        />
      </Route>
    </Routes>
  );
}
