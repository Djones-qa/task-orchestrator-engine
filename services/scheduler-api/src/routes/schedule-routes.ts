import { Router } from 'express';
import { ScheduleController } from '../controllers/schedule-controller.js';

export function createScheduleRoutes(controller: ScheduleController): Router {
  const router = Router();
  router.post('/schedules', (req, res, next) => controller.create(req, res, next));
  router.get('/schedules', (req, res, next) => controller.list(req, res, next));
  router.patch('/schedules/:id', (req, res, next) => controller.toggle(req, res, next));
  return router;
}
