import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { usersRepository } from '../users/repository.js';
import { ApiError } from '../../utils/errors.js';
const dummyHash = await bcrypt.hash('unusable-dummy-password', 12);
export function authService(db, config) {
  const users = usersRepository(db);
  return {
    async register(input) { return users.create({ ...input, password_hash: await bcrypt.hash(input.password, 12) }); },
    async login(input) {
      const user = await users.byEmail(input.email);
      const valid = await bcrypt.compare(input.password, user?.password_hash ?? dummyHash);
      if (!user || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      const token = jwt.sign({}, config.JWT_SECRET, { subject: user.user_id, algorithm: 'HS256', expiresIn: config.JWT_TTL_SECONDS, issuer: 'ticket-booking', audience: 'ticket-booking-api' });
      return { access_token: token, token_type: 'Bearer', expires_in: config.JWT_TTL_SECONDS };
    },
  };
}
