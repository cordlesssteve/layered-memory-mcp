/**
 * Graceful shutdown handling for the MCP server
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Logger } from './logger.js';

/**
 * Setup graceful shutdown handlers for the MCP server
 */
// eslint-disable-next-line max-lines-per-function
export function setupGracefulShutdown(_server: Server, logger: Logger): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      logger.warn('Forced shutdown requested', { signal });
      process.exit(1);
    }

    isShuttingDown = true;
    logger.info('Graceful shutdown initiated', { signal });

    try {
      // Give the server a chance to close connections gracefully
      await new Promise<void>(resolve => {
        const timeout = setTimeout(() => {
          logger.warn('Shutdown timeout reached, forcing exit');
          resolve();
        }, 5000); // 5 second timeout

        // Close server (this will be expanded when we have actual resources to clean up)
        logger.info('Closing server connections...');
        clearTimeout(timeout);
        resolve();
      });

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };

  // Handle various shutdown signals
  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch(error => {
      // eslint-disable-next-line no-console
      console.error('Shutdown error:', error);
      process.exit(1);
    });
  });

  process.on('SIGINT', () => {
    shutdown('SIGINT').catch(error => {
      // eslint-disable-next-line no-console
      console.error('Shutdown error:', error);
      process.exit(1);
    });
  });

  // Handle Docker stop signal
  process.on('SIGUSR2', () => {
    shutdown('SIGUSR2').catch(error => {
      // eslint-disable-next-line no-console
      console.error('Shutdown error:', error);
      process.exit(1);
    });
  });
}
