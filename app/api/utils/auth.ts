import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { query } from '../../db/connection.js';

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  business_name: string;
  business_id?: number;
}

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
    `SELECT u.id, u.email, u.first_name, u.last_name, u.business_name, g.id as business_id
     FROM users u
     LEFT JOIN businesses g ON g.owner_id = u.id
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
    `SELECT u.id, u.email, u.first_name, u.last_name, u.business_name, g.id as business_id
     FROM users u
     LEFT JOIN businesses g ON g.owner_id = u.id
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
  lastName: string,
  businessName: string
): Promise<User> => {
  const hashedPassword = await hashPassword(password);
  
  const result = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, business_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, first_name, last_name, business_name`,
    [email, hashedPassword, firstName, lastName, businessName]
  );

  return result.rows[0] as User;
};

export const verifyUserPassword = async (email: string, password: string): Promise<User | null> => {
  const result = await query(
    `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.business_name, g.id as business_id
     FROM users u
     LEFT JOIN businesses g ON g.owner_id = u.id
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
