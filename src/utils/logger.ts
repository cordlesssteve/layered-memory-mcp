/**
 * Logging utility with structured logging support
 */

export interface LogContext {
  [key: string]: unknown;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface Logger {
  debug(_message: string, _context?: LogContext): void;
  info(_message: string, _context?: LogContext): void;
  warn(_message: string, _context?: LogContext): void;
  error(_message: string, _context?: LogContext): void;
}

class ConsoleLogger implements Logger {
  constructor(
    private readonly _component: string,
    private readonly _logLevel: LogLevel = 'info'
  ) {}

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      this.log('DEBUG', message, context);
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      this.log('INFO', message, context);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      this.log('WARN', message, context);
    }
  }

  error(message: string, context?: LogContext): void {
    if (this.shouldLog('error')) {
      this.log('ERROR', message, context);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      silent: 4,
    };

    return levels[level] >= levels[this._logLevel];
  }

  private log(level: string, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      component: this._component,
      message,
      ...(context && Object.keys(context).length > 0 ? { context } : {}),
    };

    const output = JSON.stringify(logEntry);

    // IMPORTANT: All logs must go to stderr to avoid corrupting MCP protocol on stdout
    // eslint-disable-next-line no-console
    console.error(output);
  }
}

/**
 * Create a logger instance for a specific component
 */
export function createLogger(component: string): Logger {
  const logLevel = (process.env['LOG_LEVEL'] as LogLevel) || 'info';
  return new ConsoleLogger(component, logLevel);
}
