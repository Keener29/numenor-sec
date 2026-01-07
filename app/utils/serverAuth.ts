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
    // Get the token from cookies (SSR) if available
    const cookieHeader = request.headers.get('cookie');
    const userAgent = request.headers.get('user-agent') || '';

    // Verify auth by calling the API; prefer forwarding cookies (SSR) or credentials (CSR)
    // Use internal Docker URL if available (SSR), otherwise use the public URL (Client)
    const apiUrl = process.env.DOCKER_API_URL || process.env.VITE_API_URL;
    
    if (!apiUrl) {
      console.error('API URL not configured - DOCKER_API_URL and VITE_API_URL are both undefined');
      return { user: null, isAuthenticated: false };
    }

    const response = await fetch(`${apiUrl}/auth/me`, cookieHeader ? {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cookie': cookieHeader || '',
        'User-Agent': userAgent
      }
    } : {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend rejected auth. Status: ${response.status}. Body: ${errorText}`);
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
