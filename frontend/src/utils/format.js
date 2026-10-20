export const money = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    value,
  );
export const dateTime = (value) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export const localDay = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const cents = (value) => {
  const [whole, decimal = "00"] = String(value).split(".");
  return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
};
export const total = (seats) => {
  const n = seats.reduce((sum, s) => sum + cents(s.price), 0n);
  return `${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
};
export function operationKey(scope, signature) {
  const name = "frame.operation." + scope;
  let old;
  try {
    old = JSON.parse(sessionStorage.getItem(name));
  } catch {}
  if (old?.signature === signature) return old.key;
  const key = crypto.randomUUID();
  sessionStorage.setItem(name, JSON.stringify({ signature, key }));
  return key;
}
export const clearOperation = (scope) =>
  sessionStorage.removeItem("frame.operation." + scope);
export function poster(movie) {
  return (
    movie.poster_url ||
    `/posters/${Number(BigInt(movie.movie_id || "1") % 6n)}.svg`
  );
}
