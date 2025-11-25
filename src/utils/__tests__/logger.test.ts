/**
 * Tests for the logging utility
 */

import { createLogger } from '../logger';

describe('Logger', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let originalLogLevel: string | undefined;

  beforeEach(() => {
    // Store original log level
    originalLogLevel = process.env['LOG_LEVEL'];
    // Set log level to allow logging
    process.env['LOG_LEVEL'] = 'debug';

    // All logs go to stderr (console.error) to avoid corrupting MCP protocol on stdout
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    // Restore original log level
    if (originalLogLevel !== undefined) {
      process.env['LOG_LEVEL'] = originalLogLevel;
    } else {
      delete process.env['LOG_LEVEL'];
    }

    consoleErrorSpy.mockRestore();
  });

  describe('createLogger', () => {
    it('should create a logger with the specified component name', () => {
      const logger = createLogger('test-component');
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should log info messages with proper structure', () => {
      const logger = createLogger('test-component');
      logger.info('Test message', { key: 'value' });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const [[logCall]] = consoleErrorSpy.mock.calls;
      const logEntry = JSON.parse(logCall);

      expect(logEntry).toMatchObject({
        level: 'INFO',
        component: 'test-component',
        message: 'Test message',
        context: { key: 'value' },
      });
      expect(logEntry.timestamp).toBeDefined();
    });

    it('should log without context when not provided', () => {
      const logger = createLogger('test-component');
      logger.info('Test message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const [[logCall]] = consoleErrorSpy.mock.calls;
      const logEntry = JSON.parse(logCall);

      expect(logEntry).toMatchObject({
        level: 'INFO',
        component: 'test-component',
        message: 'Test message',
      });
      expect(logEntry.context).toBeUndefined();
    });

    it('should respect log level filtering', () => {
      // Set log level to warn
      process.env['LOG_LEVEL'] = 'warn';
      const logger = createLogger('test-component');

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      // Should only log warn and error (both go to stderr)
      // Since all logs use console.error, we expect 2 calls total
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

      // Verify the logged levels
      const firstCall = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      const secondCall = JSON.parse(consoleErrorSpy.mock.calls[1][0]);

      expect(firstCall.level).toBe('WARN');
      expect(secondCall.level).toBe('ERROR');
    });
  });
});
