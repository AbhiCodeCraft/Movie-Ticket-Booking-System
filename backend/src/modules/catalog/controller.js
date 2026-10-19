import { id, listInput } from './validation.js';
export function catalogController(service, def) {
  return {
    list: async (req,res) => {
      const filter = listInput.parse(req.query), result = await service.list(filter);
      res.json({ data: result.data, pagination: { page: filter.page, limit: filter.limit, total: result.total } });
    },
    get: async (req,res) => res.json({ data: await service.get(id.parse(req.params.id)) }),
    create: async (req,res) => res.status(201).json({ data: await service.mutate('create', null, def.schema.parse(req.body)) }),
    update: async (req,res) => res.json({ data: await service.mutate('update', id.parse(req.params.id), def.schema.partial().refine(v => Object.keys(v).length > 0, 'At least one field required').parse(req.body)) }),
    remove: async (req,res) => { await service.mutate('remove', id.parse(req.params.id)); res.json({ data: { deleted: true } }); },
  };
}
