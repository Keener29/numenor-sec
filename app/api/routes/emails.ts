import { Router } from 'express';
import emailManagementRoutes from './email-management.js';
import emailApprovalRoutes from './email-approval.js';
import emailActionsRoutes from './email-actions.js';

const router = Router();

// Mount all email-related routes
router.use('/', emailManagementRoutes);  // GET, POST, PUT, DELETE /
router.use('/', emailApprovalRoutes);   // POST /:id/approve, POST /:id/decline
router.use('/', emailActionsRoutes);    // POST /:id/resend, GET /stats

export default router;
