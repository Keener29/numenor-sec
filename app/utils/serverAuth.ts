// Server-side authentication utilities for React Router loaders

export interface AuthUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  businessName: string;
  businessId: number;
}

export interface AuthResult {
  user: AuthUser | null;
  isAuthenticated: boolean;
}

/**
 * Server-side authentication check for React Router loaders
 * Verifies JWT token and returns user data
 */
export async function verifyServerAuth(request: Request): Promise<AuthResult> {
  try {
    // Get the token from cookies
    const cookieHeader = request.headers.get('cookie');
    const token = cookieHeader
      ?.split('; ')
      .find(row => row.startsWith('authToken='))
      ?.split('=')[1];

    if (!token) {
      return { user: null, isAuthenticated: false };
    }

    // Verify the token by making a request to the API
    const apiUrl = process.env.API_URL || 'http://localhost:3001';
    const response = await fetch(`${apiUrl}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Cookie': `authToken=${token}`, // Also send cookie for server-side requests
      },
    });

    if (!response.ok) {
      return { user: null, isAuthenticated: false };
    }

    const userData = await response.json();
    return { user: userData.user, isAuthenticated: true };
  } catch (error) {
    console.error('Server auth verification failed:', error);
    return { user: null, isAuthenticated: false };
  }
}

/**
 * Server-side authentication check that throws redirect if not authenticated
 * Use this in loader functions for protected routes
 */
export async function requireServerAuth(request: Request): Promise<AuthUser> {
  const { user, isAuthenticated } = await verifyServerAuth(request);
  
  if (!isAuthenticated || !user) {
    throw new Response(null, {
      status: 302,
      headers: {
        Location: '/login',
      },
    });
  }
  
  return user;
}

/**
 * Server-side authentication check that redirects if already authenticated
 * Use this in loader functions for public routes (like login/signup)
 */
export async function redirectIfAuthenticated(request: Request): Promise<void> {
  const { isAuthenticated } = await verifyServerAuth(request);
  
  if (isAuthenticated) {
    throw new Response(null, {
      status: 302,
      headers: {
        Location: '/dashboard',
      },
    });
  }
}
