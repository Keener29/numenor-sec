import rateLimit from 'express-rate-limit';

// Step 1: Mock rateLimit
jest.mock('express-rate-limit');

// Step 2: Make the mock return its config so we can inspect it
(rateLimit as jest.Mock).mockImplementation((config) => config);

// Step 3: Import the module under test **after** mocking
const { apiLimiter, authLimiter, oauthLimiter } = require('../rateLimit'); // adjust path

describe('Rate limiters config', () => {
  it('should create apiLimiter with correct options', () => {
    expect(apiLimiter).toMatchObject({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
  });

  it('should create authLimiter with correct options', () => {
    expect(authLimiter).toMatchObject({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: 'Too many authentication attempts, please try again later.',
      skipSuccessfulRequests: true,
      standardHeaders: true,
      legacyHeaders: false,
    });
  });

  it('should create oauthLimiter with correct options', () => {
    expect(oauthLimiter).toMatchObject({
      windowMs: 60 * 60 * 1000,
      max: 10,
      message: 'Too many OAuth attempts, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
  });
});
