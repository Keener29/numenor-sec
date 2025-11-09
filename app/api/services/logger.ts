/**
 * Professional Structured Logging Service
 * Provides consistent, structured logging across all email and OAuth operations
 */

import type { LogContext } from '../types/email.js';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly context: LogContext;
  readonly error?: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
  };
  readonly metadata?: Record<string, unknown>;
}

class Logger {
  private readonly isDevelopment = process.env.NODE_ENV === 'development';
  private readonly isProduction = process.env.NODE_ENV === 'production';

  /**
   * Log an error message with context
   */
  error(message: string, context: LogContext, error?: Error, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context, error, metadata);
  }

  /**
   * Log a warning message with context
   */
  warn(message: string, context: LogContext, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context, undefined, metadata);
  }

  /**
   * Log an info message with context
   */
  info(message: string, context: LogContext, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context, undefined, metadata);
  }

  /**
   * Log a debug message with context (only in development)
   */
  debug(message: string, context: LogContext, metadata?: Record<string, unknown>): void {
    if (this.isDevelopment) {
      this.log(LogLevel.DEBUG, message, context, undefined, metadata);
    }
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context: LogContext,
    error?: Error,
    metadata?: Record<string, unknown>
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: this.isDevelopment ? error.stack : undefined
      } : undefined,
      metadata
    };

    // In production, use structured JSON logging
    if (this.isProduction) {
      console.log(JSON.stringify(logEntry));
    } else {
      // In development, use human-readable format
      this.logToConsole(logEntry);
    }
  }

  /**
   * Format log entry for console output in development
   */
  private logToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp;
    const level = entry.level.toUpperCase().padEnd(5);
    const operation = entry.context.operation;
    const contextInfo = this.formatContext(entry.context);
    
    let logMessage = `[${timestamp}] ${level} [${operation}] ${entry.message}`;
    
    if (contextInfo) {
      logMessage += ` | ${contextInfo}`;
    }

    if (entry.metadata) {
      logMessage += ` | ${JSON.stringify(entry.metadata)}`;
    }

    if (entry.error) {
      logMessage += `\nError: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        logMessage += `\nStack: ${entry.error.stack}`;
      }
    }

    // Use appropriate console method based on level
    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.INFO:
        console.info(logMessage);
        break;
      case LogLevel.DEBUG:
        console.debug(logMessage);
        break;
    }
  }

  /**
   * Format context information for logging
   */
  private formatContext(context: LogContext): string {
    const parts: string[] = [];
    
    if (context.requestId) parts.push(`req:${context.requestId}`);
    if (context.userId) parts.push(`user:${context.userId}`);
    if (context.businessId) parts.push(`business:${context.businessId}`);
    if (context.emailAddress) parts.push(`email:${context.emailAddress}`);
    if (context.sender) parts.push(`sender:${context.sender}`);
    
    return parts.join(' ');
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: Partial<LogContext>): ChildLogger {
    return new ChildLogger(this, additionalContext);
  }
}

/**
 * Child logger that inherits context from parent
 */
class ChildLogger {
  private readonly isDevelopment = process.env.NODE_ENV === 'development';
  private readonly isProduction = process.env.NODE_ENV === 'production';

  constructor(
    private readonly parent: Logger,
    private readonly additionalContext: Partial<LogContext>
  ) {}

  error(message: string, context: LogContext, error?: Error, metadata?: Record<string, unknown>): void {
    const mergedContext: LogContext = {
      ...context,
      ...this.additionalContext
    };
    this.parent.error(message, mergedContext, error, metadata);
  }

  warn(message: string, context: LogContext, metadata?: Record<string, unknown>): void {
    const mergedContext: LogContext = {
      ...context,
      ...this.additionalContext
    };
    this.parent.warn(message, mergedContext, metadata);
  }

  info(message: string, context: LogContext, metadata?: Record<string, unknown>): void {
    const mergedContext: LogContext = {
      ...context,
      ...this.additionalContext
    };
    this.parent.info(message, mergedContext, metadata);
  }

  debug(message: string, context: LogContext, metadata?: Record<string, unknown>): void {
    const mergedContext: LogContext = {
      ...context,
      ...this.additionalContext
    };
    this.parent.debug(message, mergedContext, metadata);
  }

  child(additionalContext: Partial<LogContext>): ChildLogger {
    return new ChildLogger(this.parent, { ...this.additionalContext, ...additionalContext });
  }

  private log(
    level: LogLevel,
    message: string,
    context: LogContext,
    error?: Error,
    metadata?: Record<string, unknown>
  ): void {
    const mergedContext: LogContext = {
      ...context,
      ...this.additionalContext
    };
    (this.parent as any).log(level, message, mergedContext, error, metadata);
  }

  private logToConsole(entry: LogEntry): void {
    (this.parent as any).logToConsole(entry);
  }

  private formatContext(context: LogContext): string {
    return (this.parent as any).formatContext(context);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience methods for common operations
export const emailLogger = logger.child({ operation: 'email-service' });
export const oauthLogger = logger.child({ operation: 'oauth-service' });
export const securityLogger = logger.child({ operation: 'security' });
export const monitoringLogger = logger.child({ operation: 'email-monitoring' });
