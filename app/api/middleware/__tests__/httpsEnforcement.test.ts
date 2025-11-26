import { enforceHttps } from '../httpsEnforcement.js';
import type { Request, Response, NextFunction } from 'express';

describe('enforceHttps middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    req = {
      header: jest.fn(),
      url: '/test'
    };

    res = {
      redirect: jest.fn()
    };

    next = jest.fn();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv; // Reset env
  });

  it('should redirect to HTTPS in production when protocol is http', () => {
    process.env.NODE_ENV = 'production';

    (req.header as jest.Mock)
      .mockImplementation((h: string) => {
        if (h === 'x-forwarded-proto') return 'http';
        if (h === 'host') return 'example.com';
        return undefined;
      });

    enforceHttps(req as Request, res as Response, next);

    expect(res.redirect).toHaveBeenCalledWith(
      301,
      'https://example.com/test'
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should not redirect in production when protocol is https', () => {
    process.env.NODE_ENV = 'production';

    (req.header as jest.Mock)
      .mockImplementation((h: string) => {
        if (h === 'x-forwarded-proto') return 'https';
        return undefined;
      });

    enforceHttps(req as Request, res as Response, next);

    expect(res.redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should not redirect outside production', () => {
    process.env.NODE_ENV = 'development';

    enforceHttps(req as Request, res as Response, next);

    expect(res.redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should call next() when x-forwarded-proto is missing in production', () => {
    process.env.NODE_ENV = 'production';

    (req.header as jest.Mock).mockReturnValue(undefined);

    enforceHttps(req as Request, res as Response, next);

    expect(res.redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
