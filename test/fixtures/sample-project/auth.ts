/**
 * Sample auth module for testing call graph extraction
 */

import { hashPassword, comparePassword } from './utils';
import { findUserByEmail, createUser } from './db';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
}

export async function login(email: string, password: string): Promise<User | null> {
  const user = await findUserByEmail(email);
  if (!user) {
    return null;
  }

  const isValid = await comparePassword(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  return user;
}

export async function register(email: string, password: string): Promise<User> {
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new Error('User already exists');
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser(email, passwordHash);

  return user;
}

export function validateEmail(email: string): boolean {
  return email.includes('@') && email.includes('.');
}
