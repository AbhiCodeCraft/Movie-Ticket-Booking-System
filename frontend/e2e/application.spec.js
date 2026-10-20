import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
const { Pool } = createRequire(
  new URL("../../backend/package.json", import.meta.url),
)("pg");
if (
  !process.env.E2E_DB_URL ||
  !/^\/ticket_m3_e2e_[a-f0-9]{24}$/.test(
    new URL(process.env.E2E_DB_URL).pathname,
  )
)
  throw new Error(
    "Run backend/scripts/e2e.js; a disposable E2E database is required",
  );
const db = new Pool({ connectionString: process.env.E2E_DB_URL });
let fx,
  errors = [];
async function register(page) {
  const email = `browser-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Cinema Guest");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_PASSWORD);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "My bookings", exact: true }),
  ).toBeVisible();
  return email;
}
async function selectAndHold(page) {
  await page.goto(`/shows/${fx.showId}/seats`);
  await page.getByRole("button", { name: /Seat A1,/ }).click();
  await page.getByRole("button", { name: "Reserve seats" }).click();
  await expect(page).toHaveURL(/\/checkout\/\d+$/);
  return page.url().split("/").at(-1);
}
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const movie = (
      await db.query("SELECT * FROM movies ORDER BY movie_id LIMIT 1")
    ).rows[0],
    theatre = (
      await db.query("SELECT * FROM theatres ORDER BY theatre_id LIMIT 1")
    ).rows[0];
  const audi = (
    await db.query(
      "INSERT INTO auditoriums(theatre_id,audi_number) SELECT $1,COALESCE(max(audi_number),0)+1 FROM auditoriums WHERE theatre_id=$1 RETURNING *",
      [theatre.theatre_id],
    )
  ).rows[0];
  for (let c = 1; c <= 4; c++)
    await db.query(
      "INSERT INTO seats(auditorium_id,seat_number,row,\"column\",seat_type) VALUES($1,$2,'A',$3,'STANDARD')",
      [audi.auditorium_id, "A" + c, c],
    );
  const show = (
    await db.query(
      "INSERT INTO shows(movie_id,auditorium_id,start_time,end_time) VALUES($1,$2,now()+interval '2 days',now()+interval '2 days 2 hours 30 minutes') RETURNING *",
      [movie.movie_id, audi.auditorium_id],
    )
  ).rows[0];
  const seats = (
    await db.query(
      "INSERT INTO show_seats(show_id,seat_id,auditorium_id,price) SELECT $1,seat_id,auditorium_id,250 FROM seats WHERE auditorium_id=$2 RETURNING *",
      [show.show_id, audi.auditorium_id],
    )
  ).rows;
  fx = { showId: show.show_id, movie, seats };
});
test.afterEach(() => expect(errors).toEqual([]));
test.afterAll(async () => {
  await db.end();
});
test("customer registers, signs in, browses, books and cancels with a persisted refund", async ({
  page,
}) => {
  const email = await register(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("link", { name: /Sign in/ }).click();
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: new RegExp(fx.movie.title) }).click();
  await page.locator(`a[href="/shows/${fx.showId}/seats"]`).click();
  await page.getByRole("button", { name: /Seat A1,/ }).click();
  await page.getByRole("button", { name: /Seat A2,/ }).click();
  await mkdir("../docs/screenshots", { recursive: true });
  await page.screenshot({
    path: "../docs/screenshots/seat-selection.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Reserve seats" }).click();
  await expect(page).toHaveURL(/\/checkout\/\d+$/);
  const booking = page.url().split("/").at(-1);
  await expect(page.getByRole("timer")).toBeVisible();
  await page
    .getByRole("button", { name: "Simulate payment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "You're going to the movies." }),
  ).toBeVisible();
  await page.screenshot({
    path: "../docs/screenshots/confirmation.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(page.getByText(/Full simulated refund recorded/)).toBeVisible();
  const state = (
    await db.query(
      "SELECT b.status,p.status AS payment_status FROM bookings b JOIN payments p USING(booking_id) WHERE b.booking_id=$1",
      [booking],
    )
  ).rows[0];
  expect(state).toEqual({ status: "CANCELLED", payment_status: "REFUNDED" });
  expect(
    (
      await db.query("SELECT status FROM show_seats WHERE show_id=$1", [
        fx.showId,
      ])
    ).rows.every((s) => s.status === "AVAILABLE"),
  ).toBe(true);
  await page
    .getByRole("link", { name: "My bookings", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("link", { name: "View booking #" + booking }),
  ).toBeVisible();
});
test("two customers see a real reservation conflict and refreshed seat availability", async ({
  page,
  browser,
}) => {
  const other = await browser.newContext(),
    b = await other.newPage();
  try {
    await register(page);
    await register(b);
    for (const p of [page, b]) {
      await p.goto(`/shows/${fx.showId}/seats`);
      await p.getByRole("button", { name: /Seat A1,/ }).click();
    }
    await page.getByRole("button", { name: "Reserve seats" }).click();
    await expect(page).toHaveURL(/checkout/);
    await b.getByRole("button", { name: "Reserve seats" }).click();
    await expect(b.getByRole("alert")).toContainText("no longer available");
    await expect(b.getByRole("button", { name: /Seat A1,/ })).toBeDisabled();
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM bookings WHERE show_id=$1",
          [fx.showId],
        )
      ).rows[0].n,
    ).toBe(1);
  } finally {
    await other.close();
  }
});
test("a server-expired hold rejects payment and the checkout recovers", async ({
  page,
}) => {
  await register(page);
  const id = await selectAndHold(page);
  await expect(
    page.getByRole("button", { name: "Simulate payment", exact: true }),
  ).toBeVisible();
  await db.query(
    "UPDATE bookings SET expires_at=now()-interval '1 second' WHERE booking_id=$1",
    [id],
  );
  await db.query(
    "UPDATE show_seats SET locked_until=now()-interval '1 second' WHERE current_booking_id=$1",
    [id],
  );
  await page
    .getByRole("button", { name: "Simulate payment", exact: true })
    .click();
  await expect(page.getByText("Your hold has expired.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Choose seats again" }),
  ).toBeVisible();
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM payments WHERE booking_id=$1",
        [id],
      )
    ).rows[0].n,
  ).toBe(0);
});
test("failed simulation is recoverable and a later success creates one charge", async ({
  page,
}) => {
  await register(page);
  const id = await selectAndHold(page);
  await page.getByLabel("Simulation outcome").selectOption("FAILED");
  await page
    .getByRole("button", { name: "Simulate payment", exact: true })
    .click();
  await expect(page.getByText(/Payment was declined/)).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Simulate payment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "You're going to the movies." }),
  ).toBeVisible();
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM payments WHERE booking_id=$1 AND status='SUCCESS'",
        [id],
      )
    ).rows[0].n,
  ).toBe(1);
});
test("a lost successful response and page refresh cannot double-charge", async ({
  page,
}) => {
  await register(page);
  const id = await selectAndHold(page);
  await page.route(
    `**/api/bookings/${id}/payments`,
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Simulate payment", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Cannot reach");
  await page.reload();
  await expect(
    page.getByText("This booking is no longer awaiting payment."),
  ).toBeVisible();
  await page.getByRole("link", { name: "View booking", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "You're going to the movies." }),
  ).toBeVisible();
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM payments WHERE booking_id=$1",
        [id],
      )
    ).rows[0].n,
  ).toBe(1);
});
test("admin creates a complete screening through the UI and a customer can reserve it", async ({
  page,
  browser,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(process.env.E2E_ADMIN_EMAIL);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Studio admin" }).click();
  const name = "Browser Premiere " + randomUUID().slice(0, 8),
    theatre = "Browser Cinema " + randomUUID().slice(0, 8);
  await page.getByRole("button", { name: "Movies", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(name);
  await page.getByLabel("Language", { exact: true }).fill("English");
  await page.getByLabel("Release date").fill("2026-01-01");
  await page.getByLabel("Duration (minutes)").fill("120");
  await page.getByRole("button", { name: "Create movie", exact: true }).click();
  await expect(page.getByText("Movies saved to the database.")).toBeVisible();
  await page.getByRole("button", { name: "Theatres", exact: true }).click();
  await page.getByLabel("Theatre name").fill(theatre);
  await page.getByLabel("Location", { exact: true }).fill("Mumbai");
  await page
    .getByRole("button", { name: "Create theatre", exact: true })
    .click();
  await expect(page.getByText("Theatres saved to the database.")).toBeVisible();
  await page.getByRole("button", { name: "Auditoriums", exact: true }).click();
  await page
    .getByLabel("Theatre", { exact: true })
    .selectOption(
      await page
        .getByRole("option", { name: new RegExp(theatre) })
        .getAttribute("value"),
    );
  await page.getByLabel("Auditorium number").fill("1");
  await page
    .getByRole("button", { name: "Create auditorium", exact: true })
    .click();
  await expect(
    page.getByText("Auditoriums saved to the database."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Seats", exact: true }).click();
  const grid = page.getByLabel("Grid auditorium");
  await grid.selectOption(
    await grid
      .getByRole("option", { name: new RegExp(theatre) })
      .getAttribute("value"),
  );
  await page.getByLabel("Row labels").fill("A,B");
  await page.getByLabel("Seats per row").fill("2");
  await page.getByRole("button", { name: "Generate seats" }).click();
  await expect(
    page.getByText("4 seats created. Existing seat numbers were kept."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Shows", exact: true }).click();
  const movie = page.getByLabel("Movie", { exact: true });
  await movie.selectOption(
    await movie
      .getByRole("option", { name: new RegExp(name) })
      .getAttribute("value"),
  );
  const auditorium = page.getByLabel("Auditorium", { exact: true });
  await auditorium.selectOption(
    await auditorium
      .getByRole("option", { name: new RegExp(theatre) })
      .getAttribute("value"),
  );
  const start = new Date(Date.now() + 3 * 86400000),
    end = new Date(start.getTime() + 2 * 3600000);
  const local = (d) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  await page.getByLabel("Start time (local)").fill(local(start));
  await page.getByLabel("End time (local)").fill(local(end));
  await page.getByLabel("Seat price (INR)").fill("199.50");
  await page.getByRole("button", { name: "Create show", exact: true }).click();
  await expect(page.getByText("Shows saved to the database.")).toBeVisible();
  await page.screenshot({
    path: "../docs/screenshots/admin.png",
    fullPage: true,
  });
  const show = (
    await db.query(
      "SELECT s.show_id FROM shows s JOIN movies m USING(movie_id) WHERE m.title=$1",
      [name],
    )
  ).rows[0];
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM show_seats WHERE show_id=$1",
        [show.show_id],
      )
    ).rows[0].n,
  ).toBe(4);
  const context = await browser.newContext(),
    customer = await context.newPage();
  try {
    await register(customer);
    await customer.getByRole("link", { name: new RegExp(name) }).click();
    await customer.locator(`a[href="/shows/${show.show_id}/seats"]`).click();
    await customer.getByRole("button", { name: /Seat A1,/ }).click();
    await customer.getByRole("button", { name: "Reserve seats" }).click();
    await expect(customer).toHaveURL(/checkout/);
  } finally {
    await context.close();
  }
});
test("customer admin access is denied and expired authentication returns to sign-in", async ({
  page,
}) => {
  await register(page);
  await page.goto("/admin");
  await expect(page.getByText("Administrator access required")).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("frame.token", "invalid"));
  await page.goto("/bookings");
  await expect(
    page.getByRole("heading", { name: "Good to see you again." }),
  ).toBeVisible();
});
test("desktop and mobile catalog render without overflow or broken poster assets", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find your kind of cinema" }),
  ).toBeVisible();
  await expect
    .poll(() => page.locator(".movie-card").count())
    .toBeGreaterThanOrEqual(6);
  await page
    .locator(".movie-card img")
    .evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
  await page.screenshot({
    path: "../docs/screenshots/catalog-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "../docs/screenshots/catalog-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".movie-card img")
      .evaluateAll((images) =>
        images.every((img) => img.complete && img.naturalWidth > 0),
      ),
  ).toBe(true);
});
