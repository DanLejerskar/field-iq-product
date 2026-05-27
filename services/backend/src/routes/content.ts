import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/plugin.js';
import { badRequest, notFound } from '../errors.js';
import {
  getActiveProcedureForEquipment,
  getEquipmentById,
  getEquipmentByQr,
  getProcedure,
  getProcedureSteps,
} from '../db/repo.js';

export function registerContentRoutes(app: FastifyInstance): void {
  app.get('/api/equipment/:id', { preHandler: authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const eq = await getEquipmentById(id);
    if (!eq) throw notFound('Equipment not found');
    return eq;
  });

  app.post('/api/equipment/resolve', { preHandler: authenticate }, async (req) => {
    const { qrValue } = (req.body ?? {}) as { qrValue?: string };
    if (!qrValue) throw badRequest('qrValue is required');
    const eq = await getEquipmentByQr(qrValue);
    if (!eq) throw notFound('No equipment for that QR value');
    const procedure = await getActiveProcedureForEquipment(eq.id);
    return { equipment: eq, activeProcedure: procedure ?? null };
  });

  app.get('/api/procedures/:id', { preHandler: authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const proc = await getProcedure(id);
    if (!proc) throw notFound('Procedure not found');
    return proc;
  });

  app.get('/api/procedures/:id/steps', { preHandler: authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const steps = await getProcedureSteps(id);
    return { steps };
  });
}
