// API utility functions for frontend-backend communication

// Generic API request function
const apiRequest = async (endpoint: string, options: RequestInit = {}): Promise<any> => {
  const config: RequestInit = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };
  let apiUrl = process.env.VITE_API_URL;

  const response = await fetch(`${apiUrl}${endpoint}`, config);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Network error' }));
    
    // Handle validation errors with detailed messages
    if (errorData.details && Array.isArray(errorData.details)) {
      const validationMessages = errorData.details.map((detail: any) => detail.message).join(', ');
      const error = new Error(validationMessages);
      (error as any).errorData = errorData;
      throw error;
    }
    
    // Preserve error data for bulk operations and other structured errors
    const error = new Error(errorData.error || `HTTP ${response.status}`);
    (error as any).errorData = errorData;
    throw error;
  }
  
  return response.json();
};

// Auth API functions
export const authAPI = {
  // Register new user
  register: async (userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    businessName: string;
  }) => {
    const response = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    return response;
  },

  // Login user
  login: async (credentials: { email: string; password: string; rememberMe?: boolean }) => {
    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    return response;
  },

  // Forgot password
  forgotPassword: async (data: { email: string }) => {
    return apiRequest('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Change password
  changePassword: async (passwordData: {
    currentPassword: string;
    newPassword: string;
  }) => {
    return apiRequest('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(passwordData),
    });
  },

  // Logout
  logout: async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      // Server clears HttpOnly cookie; no client-side token to remove
    }
  },

  // Reset password
  resetPassword: async (data: { token: string; newPassword: string }) => {
    return apiRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  // Google Login with GIS credential
  googleLogin: async (data: { credential: string }) => {
    return apiRequest('/auth/google', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Microsoft Login with MSAL ID token
  microsoftLogin: async (data: { idToken: string }) => {
    return apiRequest('/auth/microsoft', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Delete account and business
  deleteAccount: async (accountId: number, reason?: string) => {
    return apiRequest(`/accounts/${accountId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
  },
};

// Emails API functions
export const emailsAPI = {
  // Get all monitored emails
  getEmails: async (params?: { page?: number; limit?: number; connected?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.connected !== undefined) queryParams.append('connected', params.connected.toString());
    const qs = queryParams.toString();
    const url = qs ? `/emails?${qs}` : '/emails';
    return apiRequest(url);    
  },

  // Add new email to monitor
  addEmail: async (emailData: { emailAddress: string }) => {
    return apiRequest('/emails', {
      method: 'POST',
      body: JSON.stringify(emailData),
    });
  },

  // Add multiple emails to monitor (bulk)
  addBulkEmails: async (emailData: { emailAddresses: string[] }) => {
    return apiRequest('/emails/bulk', {
      method: 'POST',
      body: JSON.stringify(emailData),
    });
  },

  // Update email connection status
  updateEmail: async (emailId: number, updates: { isConnected?: boolean }) => {
    return apiRequest(`/emails/${emailId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  // Remove email from monitoring
  removeEmail: async (emailId: number) => {
    return apiRequest(`/emails/${emailId}`, {
      method: 'DELETE',
    });
  },

  // Resend permission request email
  resendPermissionEmail: async (emailId: number) => {
    return apiRequest(`/emails/${emailId}/resend`, {
      method: 'POST',
    });
  },

  // Get email statistics
  getEmailStats: async () => {
    return apiRequest('/emails/stats');
  },
};

// Alerts API functions
export const alertsAPI = {
  // Get all alerts
  getAlerts: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    threatLevel?: string;
    emailId?: number;
    startDate?: string;
    endDate?: string;
  }) => {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    }
    
    const qs = queryParams.toString();
    const url = qs ? `/alerts?${qs}` : '/alerts';
    return apiRequest(url);
  },

  // Get specific alert
  getAlert: async (alertId: number) => {
    return apiRequest(`/alerts/${alertId}`);
  },

  // Update alert status
  updateAlert: async (alertId: number, updates: {
    status?: string;
    description?: string;
  }) => {
    return apiRequest(`/alerts/${alertId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  // Create new alert (for testing)
  createAlert: async (alertData: {
    emailId: number;
    subject: string;
    senderEmail: string;
    recipientEmail: string;
    threatLevel: string;
    alertType: string;
    description?: string;
  }) => {
    return apiRequest('/alerts', {
      method: 'POST',
      body: JSON.stringify(alertData),
    });
  },

  // Get alert statistics
  getAlertStats: async () => {
    return apiRequest('/alerts/stats');
  },
};

// Business API functions
export const businessAPI = {
  // Get business information
  getBusiness: async () => {
    return apiRequest('/business');
  },

  // Update business information
  updateBusiness: async (updates: {
    name?: string;
    address?: string;
    phone?: string;
    website?: string;
  }) => {
    return apiRequest('/business', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  // Get business statistics
  getBusinessStats: async () => {
    return apiRequest('/business/stats');
  },
};
