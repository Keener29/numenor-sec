import { Router } from "express";
import { validateBody } from "../middleware/validation.js";
import {
  authenticateToken,
  requireBusiness,
  type AuthRequest,
} from "../middleware/auth.js";
import { completeOnboardingSchema } from "../schemas/business.js";
import { query } from "../../db/connection.js";
import { securityEventLogger } from "../utils/securityEventLogger.js";
import { generateToken } from "../utils/auth.js";

const router = Router();

// Get business information
router.get(
  "/",
  authenticateToken,
  requireBusiness,
  async (req: AuthRequest, res, next) => {
    try {
      const businessId = req.user!.business_id!;

      const result = await query(
        `SELECT id, business_name, address, phone, website, member_count, is_active, created_at, updated_at
       FROM businesses 
       WHERE id = $1`,
        [businessId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Business not found" });
      }

      const business = result.rows[0] as {
        id: number;
        business_name: string | null;
        address: string;
        phone: string;
        website: string;
        member_count: number;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
      };
      res.json({
        business: {
          id: business.id,
          name: business.business_name,
          address: business.address,
          phone: business.phone,
          website: business.website,
          memberCount: business.member_count,
          isActive: business.is_active,
          createdAt: business.created_at,
          updatedAt: business.updated_at,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// Update business information
router.put(
  "/complete-onboarding",
  authenticateToken,
  requireBusiness,
  validateBody(completeOnboardingSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const businessId = req.user!.business_id!;
      const { businessName, termsAccepted } = req.body;
      await query("BEGIN");

      const bizResult = await query(
        `UPDATE businesses 
   SET business_name = $1, updated_at = CURRENT_TIMESTAMP
   WHERE id = $2
   RETURNING *`,
        [businessName, businessId],
      );

      if (bizResult.rows.length === 0) {
        await query("ROLLBACK");
        return res.status(404).json({ error: "Business not found" });
      }
      const business = bizResult.rows[0] as {
        id: number;
        business_name: string | null;
        owner_id: number;
        address: string;
        phone: string;
        website: string;
        member_count: number;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
      };

      const userResult = await query(
        `UPDATE users 
   SET terms_accepted = $1, 
       terms_accepted_at = CURRENT_TIMESTAMP, 
       terms_version = $2,
       signup_ip_address = $3
   WHERE id = $4
   RETURNING id, first_name, last_name, email`,
        [termsAccepted, "v1.0-2026", req.ip, business.owner_id],
      );
      if (userResult.rows.length === 0) {
        await query("ROLLBACK");
        return res.status(404).json({ error: "User not found" });
      }

      // Log the update event
      await securityEventLogger.logSecurityEvent(
        businessId,
        "business_updated",
        "Business information updated",
        {
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
        },
      );

      await query("COMMIT");

      const user = userResult.rows[0] as {
        id: number;
        first_name: string;
        last_name: string;
        email: string;
      };

      const newToken = generateToken({
        ...user,
        business_id: businessId,
      });

      res.cookie("authToken", newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      });

      res.json({
        message: "Business updated successfully",
        updates: {
          id: business.id,
          businessName: business.business_name,
          ownerId: business.owner_id,
          termsAccepted: termsAccepted,
        },
      });
    } catch (error) {
      await query("ROLLBACK");
      next(error);
    }
  },
);

// Get business statistics
router.get(
  "/stats",
  authenticateToken,
  requireBusiness,
  async (req: AuthRequest, res, next) => {
    try {
      const businessId = req.user!.business_id!;

      // Get monitored emails count
      const emailsResult = await query(
        "SELECT COUNT(*) as count FROM monitored_emails WHERE business_id = $1",
        [businessId],
      );

      // Get total alerts count
      const alertsResult = await query(
        "SELECT COUNT(*) as count FROM phishing_alerts WHERE business_id = $1",
        [businessId],
      );

      // Get pending alerts count
      const pendingAlertsResult = await query(
        "SELECT COUNT(*) as count FROM phishing_alerts WHERE business_id = $1 AND status = $2",
        [businessId, "pending"],
      );

      // Get recent alerts (last 7 days)
      const recentAlertsResult = await query(
        "SELECT COUNT(*) as count FROM phishing_alerts WHERE business_id = $1 AND created_at >= NOW() - INTERVAL '7 days'",
        [businessId],
      );

      // Get connected emails count (those with OAuth tokens)
      const connectedEmailsResult = await query(
        `SELECT COUNT(*) as count 
       FROM monitored_emails me
       INNER JOIN oauth_tokens ot ON me.business_id = ot.business_id AND me.email_address = ot.email_address
       WHERE me.business_id = $1`,
        [businessId],
      );

      res.json({
        stats: {
          totalEmails: Number.parseInt(
            (emailsResult.rows[0] as { count: string }).count,
          ),
          connectedEmails: Number.parseInt(
            (connectedEmailsResult.rows[0] as { count: string }).count,
          ),
          totalAlerts: Number.parseInt(
            (alertsResult.rows[0] as { count: string }).count,
          ),
          pendingAlerts: Number.parseInt(
            (pendingAlertsResult.rows[0] as { count: string }).count,
          ),
          recentAlerts: Number.parseInt(
            (recentAlertsResult.rows[0] as { count: string }).count,
          ),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
