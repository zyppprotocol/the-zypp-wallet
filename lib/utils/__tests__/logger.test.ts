/**
 * Logger Tests
 * 
 * Tests for the logging utility
 */

import { log } from '../logger';

// Mock Sentry
jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
}));

describe('Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('log.debug', () => {
    it('should log debug messages in development', () => {
      log.debug('Test debug message', { key: 'value' });
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] Test debug message'),
        { key: 'value' }
      );
    });
  });

  describe('log.info', () => {
    it('should log info messages', () => {
      log.info('Test info message', { key: 'value' });
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] Test info message'),
        { key: 'value' }
      );
    });
  });

  describe('log.warn', () => {
    it('should log warnings to console', () => {
      log.warn('Test warning');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[WARN] Test warning'),
        ''
      );
    });

    it('should log warnings with error', () => {
      const error = new Error('Test error');
      log.warn('Test warning', error);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[WARN] Test warning'),
        error,
        ''
      );
    });
  });

  describe('log.error', () => {
    it('should log errors to console', () => {
      log.error('Test error');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] Test error'),
        ''
      );
    });

    it('should log errors with error object', () => {
      const error = new Error('Test error');
      log.error('Test error message', error, { context: 'test' });
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] Test error message'),
        error,
        { context: 'test' }
      );
    });
  });
});
