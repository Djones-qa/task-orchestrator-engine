import { Router } from 'express';
import {
  createWorkflow,
  listWorkflows,
  getWorkflow,
  updateWorkflow,
  deleteWorkflow,
} from '../controllers/workflow-controller.js';

const router = Router();

router.post('/', createWorkflow);
router.get('/', listWorkflows);
router.get('/:id', getWorkflow);
router.put('/:id', updateWorkflow);
router.delete('/:id', deleteWorkflow);

export default router;
