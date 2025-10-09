/**
 * OAuth Routes Index
 * Aggregates all OAuth provider routes
 */

import { Router } from 'express';
import gmailRoutes from './gmail.js';
// Import future provider routes here
// import outlookRoutes from './outlook.js';
// import yahooRoutes from './yahoo.js';

const router = Router();

// Mount provider-specific routes
router.use('/gmail', gmailRoutes);
// router.use('/outlook', outlookRoutes);
// router.use('/yahoo', yahooRoutes);

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
      }
      // Add future providers here
      // {
      //   id: 'outlook',
      //   name: 'Outlook',
      //   description: 'Microsoft Outlook email service',
      //   enabled: false
      // },
      // {
      //   id: 'yahoo',
      //   name: 'Yahoo Mail',
      //   description: 'Yahoo Mail email service',
      //   enabled: false
      // }
    ]
  });
});

export default router;
