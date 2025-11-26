/**
 * Validation Middleware Tests
 * Tests request body, query, and params validation
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { validateBody, validateQuery, validateParams } from '../validation.js';
import { z } from 'zod';

describe('validateBody', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      body: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis() as any,
      json: jest.fn().mockReturnThis() as any
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  it('should return 400 when payload is invalid', () => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8)
    });
    mockReq.body = { email: 'invalid-email', password: '123' };

    const middleware = validateBody(schema);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Validation failed',
      details: expect.arrayContaining([
        expect.objectContaining({
          field: 'email',
          message: expect.any(String)
        })
      ])
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should call next() when payload is valid', () => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8)
    });
    mockReq.body = { email: 'test@example.com', password: 'password123' };

    const middleware = validateBody(schema);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockReq.body).toEqual({ email: 'test@example.com', password: 'password123' });
  });

  it('should transform body according to schema', () => {
    const schema = z.object({
      email: z.string().email().toLowerCase(),
      age: z.string().transform(val => Number.parseInt(val))
    });
    mockReq.body = { email: 'TEST@EXAMPLE.COM', age: '25' };

    const middleware = validateBody(schema);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockReq.body).toEqual({ email: 'test@example.com', age: 25 });
  });

  it('should pass non-Zod errors to next', () => {
    const schema = z.object({
      email: z.string().email()
    });
    // Create a mock that throws a non-Zod error
    jest.spyOn(schema, 'parse').mockImplementation(() => {
      throw new Error('Non-Zod error');
    });

    const middleware = validateBody(schema);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    expect(mockRes.status).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });
});

describe('validateQuery', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      query: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis() as any,
      json: jest.fn().mockReturnThis() as any
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  it('should return 400 when query params are invalid', () => {
    const schema = z.object({
      page: z.string().regex(/^\d+$/).transform(Number),
      limit: z.string().regex(/^\d+$/).transform(Number)
    });
    mockReq.query = { page: 'invalid', limit: '10' };

    const middleware = validateQuery(schema);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Query validation failed',
      details: expect.arrayContaining([
        expect.objectContaining({
          field: 'page',
          message: expect.any(String)
        })
      ])
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should call next() when query params are valid', () => {
    const schema = z.object({
      page: z.string().regex(/^\d+$/).transform(Number),
      limit: z.string().regex(/^\d+$/).transform(Number)
    });
    mockReq.query = { page: '1', limit: '10' };

    const middleware = validateQuery(schema);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});

describe('validateParams', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      params: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis() as any,
      json: jest.fn().mockReturnThis() as any
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  it('should return 400 when params are invalid', () => {
    const schema = z.object({
      id: z.string().regex(/^\d+$/).transform(Number)
    });
    mockReq.params = { id: 'invalid' };

    const middleware = validateParams(schema);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Parameter validation failed',
      details: expect.arrayContaining([
        expect.objectContaining({
          field: 'id',
          message: expect.any(String)
        })
      ])
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should call next() when params are valid', () => {
    const schema = z.object({
      id: z.string().regex(/^\d+$/).transform(Number)
    });
    mockReq.params = { id: '123' };

    const middleware = validateParams(schema);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});

