import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { query } from '../../db/connection.js';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import jwksClient from 'jwks-rsa';


export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  business_name?: string; // From businesses.name via JOIN
  business_id?: number; // From businesses.id via JOIN
}

export const verifyGoogleToken = async (credential: string, clientId: string): Promise<TokenPayload | undefined> => {
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: clientId
  });

  return ticket.getPayload();
};

export interface MicrosoftTokenPayload {
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  sub?: string;
  aud?: string;
  iss?: string;
  exp?: number;
  iat?: number;
}

export const verifyMicrosoftToken = async (idToken: string, clientId: string): Promise<MicrosoftTokenPayload | undefined> => {
  try {
    // Decode token to get header and payload without verification
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
      throw new Error('Invalid token structure');
    }

    const payload = decoded.payload as MicrosoftTokenPayload;
    const issuer = payload.iss;

    // Determine JWKS URI based on issuer
    // For common tenant: https://login.microsoftonline.com/common/discovery/v2.0/keys
    // For specific tenant: https://login.microsoftonline.com/{tenantid}/discovery/v2.0/keys
    let jwksUri: string;
    if (issuer?.includes('/common/')) {
      jwksUri = 'https://login.microsoftonline.com/common/discovery/v2.0/keys';
    } else if (issuer) {
      // Extract tenant ID from issuer
      const tenantRegex = /https:\/\/login\.microsoftonline\.com\/([^/]+)/;
      const tenantMatch = tenantRegex.exec(issuer);
      if (tenantMatch && tenantMatch[1]) {
        jwksUri = `https://login.microsoftonline.com/${tenantMatch[1]}/discovery/v2.0/keys`;
      } else {
        jwksUri = 'https://login.microsoftonline.com/common/discovery/v2.0/keys';
      }
    } else {
      jwksUri = 'https://login.microsoftonline.com/common/discovery/v2.0/keys';
    }
    
    // Create JWKS client
    const client = jwksClient({
      jwksUri,
      cache: true,
      cacheMaxAge: 86400000, // 24 hours
    });

    // Get signing key
    const key = await client.getSigningKey(decoded.header.kid);
    const signingKey = key.getPublicKey();

    // Verify token signature and audience (issuer validation done manually below)
    const verifiedPayload = jwt.verify(idToken, signingKey, {
      algorithms: ['RS256'],
      audience: clientId,
      // Issuer validation is done manually after verification since it varies by tenant
    }) as MicrosoftTokenPayload;

    // Manually validate issuer - must be from Microsoft
    if (!verifiedPayload.iss?.startsWith('https://login.microsoftonline.com/') && 
        !verifiedPayload.iss?.startsWith('https://sts.windows.net/')) {
      throw new Error('Invalid issuer: token must be from Microsoft');
    }

    return verifiedPayload;
  } catch (error) {
    console.error('Microsoft token verification failed:', error);
    throw error;
  }
};

export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

export const generateToken = (user: User, expiresIn: SignOptions['expiresIn'] = '1d' as const): string => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }
  const payload = {
    id: user.id,
    sub: String(user.id),
    email: user.email,
    business_id: user.business_id
  };
  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn: expiresIn,
  };
  return jwt.sign(
    payload,
    jwtSecret,
    options
  );
};

export const getUserByEmail = async (email: string): Promise<User | null> => {
  const result = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, b.business_name as business_name, b.id as business_id
     FROM users u
     LEFT JOIN businesses b ON b.owner_id = u.id
     WHERE u.email = $1 AND u.is_active = true`,
    [email]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as User;
};

export const getUserById = async (id: number): Promise<User | null> => {
  const result = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, b.business_name as business_name, b.id as business_id
     FROM users u
     LEFT JOIN businesses b ON b.owner_id = u.id
     WHERE u.id = $1 AND u.is_active = true`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as User;
};

export const createUser = async (
  email: string,
  password: string,
  firstName: string,
  lastName: string
): Promise<User> => {
  const hashedPassword = await hashPassword(password);
  
  // Create user (no business_id or business_name - they come from businesses table via JOIN)
  const result = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, first_name, last_name`,
    [email, hashedPassword, firstName, lastName]
  );

  return result.rows[0] as User;
};

export const verifyUserPassword = async (email: string, password: string): Promise<User | null> => {
  const result = await query(
    `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, b.business_name as business_name, b.id as business_id
     FROM users u
     LEFT JOIN businesses b ON b.owner_id = u.id
     WHERE u.email = $1 AND u.is_active = true`,
    [email]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const user = result.rows[0] as User & { password_hash: string };
  const isValidPassword = await comparePassword(password, user.password_hash);

  if (!isValidPassword) {
    return null;
  }

  // Remove password_hash from returned user object
  const { password_hash, ...userWithoutPassword } = user;
  return userWithoutPassword;
};
