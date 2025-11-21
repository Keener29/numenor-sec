import crypto from 'node:crypto';

// Generate secure approval/decline tokens
export const tokenService = {
  generateApprovalToken(emailId: number, businessId: number): string {
    const payload = `approve_${emailId}_${businessId}_${Date.now()}`;
    const secret = process.env.TOKEN_SECRET;
    if (!secret) {
      throw new Error('TOKEN_SECRET environment variable is required');
    }
    const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}_${hash}`;
  },

  validateApprovalToken(token: string, emailId: number, businessId: number): boolean {
    try {
      const parts = token.split('_');
      if (parts.length < 5) return false;

      const action = parts[0];
      const tokenEmailId = Number.parseInt(parts[1]);
      const tokenBusinessId = Number.parseInt(parts[2]);
      const timestamp = Number.parseInt(parts[3]);
      const providedHash = parts[4];

      if (action !== 'approve') return false;
      if (tokenEmailId !== emailId) return false;
      if (tokenBusinessId !== businessId) return false;

      // Check if token is not older than 24 hours
      const tokenAge = Date.now() - timestamp;
      if (tokenAge > 24 * 60 * 60 * 1000) return false;

      // Verify hash
      const payload = `approve_${emailId}_${businessId}_${timestamp}`;
      const secret = process.env.TOKEN_SECRET;
      if (!secret) {
        return false;
      }
      const expectedHash = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      return providedHash === expectedHash;
    } catch (error) {
      return false;
    }
  },
};
