// API utility functions for frontend-backend communication

const API_BASE_URL = 'http://localhost:3001/api';

// Helper function to get auth token from localStorage
const getAuthToken = (): string | null => {
  return localStorage.getItem('authToken');
};

// Helper function to set auth token in localStorage
export const setAuthToken = (token: string): void => {
  localStorage.setItem('authToken', token);
};

// Helper function to remove auth token from localStorage
export const removeAuthToken = (): void => {
  localStorage.removeItem('authToken');
};

// Generic API request function
const apiRequest = async (endpoint: string, options: RequestInit = {}): Promise<any> => {
  const token = getAuthToken();
  
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
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
    gymName: string;
  }) => {
    const response = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    
    if (response.token) {
      setAuthToken(response.token);
    }
    
    return response;
  },

  // Login user
  login: async (credentials: { email: string; password: string }) => {
    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    
    if (response.token) {
      setAuthToken(response.token);
    }
    
    return response;
  },

  // Get current user
  getCurrentUser: async () => {
    return apiRequest('/auth/me');
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
      removeAuthToken();
    }
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
    
    const queryString = queryParams.toString();
    return apiRequest(`/emails${queryString ? `?${queryString}` : ''}`);
  },

  // Add new email to monitor
  addEmail: async (emailData: { emailAddress: string }) => {
    return apiRequest('/emails', {
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
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });
    
    const queryString = queryParams.toString();
    return apiRequest(`/alerts${queryString ? `?${queryString}` : ''}`);
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
    rawEmailData?: any;
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

// Gym API functions
export const gymAPI = {
  // Get gym information
  getGym: async () => {
    return apiRequest('/gym');
  },

  // Update gym information
  updateGym: async (updates: {
    name?: string;
    address?: string;
    phone?: string;
    website?: string;
  }) => {
    return apiRequest('/gym', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  // Get gym statistics
  getGymStats: async () => {
    return apiRequest('/gym/stats');
  },
};
