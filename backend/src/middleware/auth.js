import jwt from 'jsonwebtoken';
import { usersRepository } from '../modules/users/repository.js';
import { ApiError } from '../utils/errors.js';
export function authenticate(db, config) {
  const users = usersRepository(db);
  return async (req, res, next) => {
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Bearer token required');
    let claims;
    try { claims = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'], issuer: 'ticket-booking', audience: 'ticket-booking-api' }); }
    catch { throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid or expired token'); }
    if (typeof claims.sub !== 'string' || !/^[1-9]\d{0,18}$/.test(claims.sub) || BigInt(claims.sub) > 9223372036854775807n) throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid token subject');
    req.user = await users.byId(claims.sub);
    if (!req.user) throw new ApiError(401, 'UNAUTHENTICATED', 'User no longer exists');
    next();
  };
}
export function adminOnly(req, res, next) {
  if (req.user.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'Administrator role required');
  next();
}
