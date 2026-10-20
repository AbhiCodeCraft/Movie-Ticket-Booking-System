const base = (import.meta.env.VITE_API_BASE || "/api").replace(/\/+$/, "");
export const tokenStore = {
  get: () => sessionStorage.getItem("frame.token"),
  set: (token) =>
    token
      ? sessionStorage.setItem("frame.token", token)
      : sessionStorage.removeItem("frame.token"),
};
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export async function api(path, { method = "GET", body, key, signal } = {}) {
  let response;
  try {
    response = await fetch(base + path, {
      method,
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(tokenStore.get()
          ? { Authorization: `Bearer ${tokenStore.get()}` }
          : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(
      0,
      "NETWORK",
      "Cannot reach the cinema server. Check your connection and retry.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      "INVALID_RESPONSE",
      "The server returned an unexpected response. Please retry.",
    );
  }
  if (!response.ok) {
    if (response.status === 401 && tokenStore.get()) {
      tokenStore.set(null);
      window.dispatchEvent(new Event("frame:expired"));
    }
    const details = result.error?.details
      ?.map((d) => `${d.path}: ${d.message}`)
      .join("; ");
    throw new ApiError(
      response.status,
      result.error?.code,
      details || result.error?.message || "Request failed",
    );
  }
  return result;
}
export async function all(path) {
  let rows = [],
    page = 1;
  while (true) {
    const r = await api(
      `${path}${path.includes("?") ? "&" : "?"}limit=100&page=${page++}`,
    );
    rows.push(...r.data);
    if (rows.length >= r.pagination.total || !r.data.length) return rows;
  }
}
export async function catalog() {
  const [movies, theatres, auditoriums, shows] = await Promise.all(
    ["movies", "theatres", "auditoriums", "shows"].map((p) => all("/" + p)),
  );
  return {
    movies,
    theatres,
    auditoriums,
    shows: shows.map((s) => ({
      ...s,
      movie: movies.find((m) => m.movie_id === s.movie_id),
      auditorium: auditoriums.find((a) => a.auditorium_id === s.auditorium_id),
      theatre: theatres.find(
        (t) =>
          t.theatre_id ===
          auditoriums.find((a) => a.auditorium_id === s.auditorium_id)
            ?.theatre_id,
      ),
    })),
  };
}
