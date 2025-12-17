/**
 * OAuth Routes Index
 * Aggregates all OAuth provider routes
 */

import { Router } from 'express';
import gmailRoutes from './gmail.js';
import outlookRoutes from './outlook.js';

const router = Router();

// Mount provider-specific routes
router.use('/gmail', gmailRoutes);
router.use('/outlook', outlookRoutes);

/**
 * @route GET /api/oauth/providers
 * @desc Get list of available OAuth providers
 * @access Public
 */
router.get('/providers', (req, res) => {
  res.json({
    success: true,
    providers: [
      {
        id: 'gmail',
        name: 'Gmail',
        description: 'Google Gmail email service',
        enabled: true
      },
      {
        id: 'outlook',
        name: 'Outlook',
        description: 'Microsoft Outlook email service',
        enabled: true
      }
    ]
  });
});

export default router;
