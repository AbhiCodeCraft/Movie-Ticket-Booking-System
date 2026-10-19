import { registration, loginInput } from './validation.js';
export const authController = service => ({
  register: async (req, res) => res.status(201).json({ data: await service.register(registration.parse(req.body)) }),
  login: async (req, res) => res.json({ data: await service.login(loginInput.parse(req.body)) }),
  me: (req, res) => res.json({ data: req.user }),
  logout: (req, res) => res.json({ data: { message: 'Discard the access token on the client. It remains valid until expiry.' } }),
});
