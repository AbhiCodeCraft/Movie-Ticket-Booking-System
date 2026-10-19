import { Router } from 'express';
import { catalogController } from './controller.js';
import { catalogService } from './service.js';
import { adminOnly } from '../../middleware/auth.js';
export function catalogRoutes(pool, def, auth, customService) {
  const router = Router(), c = catalogController(customService ?? catalogService(pool,def), def);
  router.get('/', c.list); router.get('/:id', c.get);
  router.post('/', auth, adminOnly, c.create);
  router.patch('/:id', auth, adminOnly, c.update);
  router.delete('/:id', auth, adminOnly, c.remove);
  return router;
}
