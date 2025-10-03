import crypto from 'crypto';

// Generate secure approval/decline tokens
export const tokenService = {
  generateApprovalToken(emailId: number, businessId: number): string {
    const payload = `approve_${emailId}_${businessId}_${Date.now()}`;
    const secret = process.env.TOKEN_SECRET || 'default-secret-change-in-production';
    const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}_${hash}`;
  },

  generateDeclineToken(emailId: number, businessId: number): string {
    const payload = `decline_${emailId}_${businessId}_${Date.now()}`;
    const secret = process.env.TOKEN_SECRET || 'default-secret-change-in-production';
    const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}_${hash}`;
  },

  validateApprovalToken(token: string, emailId: number, businessId: number): boolean {
    try {
      const parts = token.split('_');
      if (parts.length < 5) return false;
      
      const action = parts[0];
      const tokenEmailId = parseInt(parts[1]);
      const tokenBusinessId = parseInt(parts[2]);
      const timestamp = parseInt(parts[3]);
      const providedHash = parts[4];
      
      if (action !== 'approve') return false;
      if (tokenEmailId !== emailId) return false;
      if (tokenBusinessId !== businessId) return false;
      
      // Check if token is not older than 24 hours
      const tokenAge = Date.now() - timestamp;
      if (tokenAge > 24 * 60 * 60 * 1000) return false;
      
      // Verify hash
      const payload = `approve_${emailId}_${businessId}_${timestamp}`;
      const secret = process.env.TOKEN_SECRET || 'default-secret-change-in-production';
      const expectedHash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      
      return providedHash === expectedHash;
    } catch (error) {
      return false;
    }
  },

  validateDeclineToken(token: string, emailId: number, businessId: number): boolean {
    try {
      const parts = token.split('_');
      if (parts.length < 5) return false;
      
      const action = parts[0];
      const tokenEmailId = parseInt(parts[1]);
      const tokenBusinessId = parseInt(parts[2]);
      const timestamp = parseInt(parts[3]);
      const providedHash = parts[4];
      
      if (action !== 'decline') return false;
      if (tokenEmailId !== emailId) return false;
      if (tokenBusinessId !== businessId) return false;
      
      // Check if token is not older than 7 days
      const tokenAge = Date.now() - timestamp;
      if (tokenAge > 24 * 60 * 60 * 1000) return false;
      
      // Verify hash
      const payload = `decline_${emailId}_${businessId}_${timestamp}`;
      const secret = process.env.TOKEN_SECRET || 'default-secret-change-in-production';
      const expectedHash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      
      return providedHash === expectedHash;
    } catch (error) {
      return false;
    }
  }
};
