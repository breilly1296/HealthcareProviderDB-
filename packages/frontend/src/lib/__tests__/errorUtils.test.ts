import {
  toAppError,
  getUserMessage,
  isRetryableStatus,
  getErrorVariant,
  isNetworkError,
  isNotFoundError,
  isValidationError,
  isAbortError,
  createErrorState,
  type AppError,
} from '../errorUtils';

describe('errorUtils', () => {
  // ============================================================================
  // toAppError
  // ============================================================================
  describe('toAppError', () => {
    it('converts Error instance to AppError', () => {
      const error = new Error('Something went wrong');
      const result = toAppError(error);

      expect(result.message).toBe('Something went wrong');
      expect(result.retryable).toBe(true);
      expect(result.originalError).toBe(error);
    });

    it('extracts statusCode from Error with statusCode property', () => {
      const error = new Error('Not found') as Error & { statusCode: number };
      error.statusCode = 404;
      const result = toAppError(error);

      expect(result.statusCode).toBe(404);
      expect(result.retryable).toBe(false); // 404 is not retryable
    });

    it('extracts statusCode from Error with status property', () => {
      const error = new Error('Server error') as Error & { status: number };
      error.status = 500;
      const result = toAppError(error);

      expect(result.statusCode).toBe(500);
      expect(result.retryable).toBe(true); // 500 is retryable
    });

    it('handles plain object with error properties', () => {
      const error = {
        message: 'Custom error',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      };
      const result = toAppError(error);

      expect(result.message).toBe('Custom error');
      expect(result.statusCode).toBe(400);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('handles string error', () => {
      const result = toAppError('Simple string error');

      expect(result.message).toBe('Simple string error');
      expect(result.retryable).toBe(true);
    });

    it('handles null/undefined with fallback message', () => {
      const nullResult = toAppError(null);
      const undefinedResult = toAppError(undefined);

      expect(nullResult.message).toBe('An unexpected error occurred');
      expect(undefinedResult.message).toBe('An unexpected error occurred');
    });

    it('handles number error', () => {
      const result = toAppError(42);

      expect(result.message).toBe('An unexpected error occurred');
      expect(result.retryable).toBe(true);
    });
  });

  // ============================================================================
  // getUserMessage
  // ============================================================================
  describe('getUserMessage', () => {
    it('returns rate limit message for 429', () => {
      const error: AppError = {
        message: 'Too many requests',
        statusCode: 429,
        retryable: true,
      };
      const message = getUserMessage(error);

      expect(message).toContain('Too many requests');
      expect(message).toContain('wait');
    });

    it('returns session expired message for 401', () => {
      const error: AppError = {
        message: 'Unauthorized',
        statusCode: 401,
        retryable: false,
      };
      const message = getUserMessage(error);

      expect(message).toContain('session');
      expect(message.toLowerCase()).toContain('expired');
    });

    it('returns permission message for 403', () => {
      const error: AppError = {
        message: 'Forbidden',
        statusCode: 403,
        retryable: false,
      };
      const message = getUserMessage(error);

      expect(message.toLowerCase()).toContain('permission');
    });

    it('returns not found message for 404', () => {
      const error: AppError = {
        message: 'Not found',
        statusCode: 404,
        retryable: false,
      };
      const message = getUserMessage(error);

      expect(message.toLowerCase()).toContain('not found');
    });

    it('returns server error message for 5xx', () => {
      const error: AppError = {
        message: 'Internal server error',
        statusCode: 500,
        retryable: true,
      };
      const message = getUserMessage(error);

      expect(message.toLowerCase()).toContain('server');
    });

    it('returns network error message for network-related errors', () => {
      const error: AppError = {
        message: 'Failed to fetch',
        retryable: true,
      };
      const message = getUserMessage(error);

      expect(message.toLowerCase()).toContain('connect');
    });

    it('returns validation error as-is (already user-friendly)', () => {
      const error: AppError = {
        message: 'Email must be valid',
        retryable: false,
      };
      const message = getUserMessage(error);

      expect(message).toBe('Email must be valid');
    });

    it('handles string input', () => {
      const message = getUserMessage('Something broke');

      expect(message).toBe('Something broke');
    });
  });

  // ============================================================================
  // isRetryableStatus
  // ============================================================================
  describe('isRetryableStatus', () => {
    it('returns true for undefined status (assume retryable)', () => {
      expect(isRetryableStatus(undefined)).toBe(true);
    });

    it('returns true for 408 (Request Timeout)', () => {
      expect(isRetryableStatus(408)).toBe(true);
    });

    it('returns true for 429 (Too Many Requests)', () => {
      expect(isRetryableStatus(429)).toBe(true);
    });

    it('returns true for 500 (Internal Server Error)', () => {
      expect(isRetryableStatus(500)).toBe(true);
    });

    it('returns true for 502 (Bad Gateway)', () => {
      expect(isRetryableStatus(502)).toBe(true);
    });

    it('returns true for 503 (Service Unavailable)', () => {
      expect(isRetryableStatus(503)).toBe(true);
    });

    it('returns true for 504 (Gateway Timeout)', () => {
      expect(isRetryableStatus(504)).toBe(true);
    });

    it('returns false for 400 (Bad Request)', () => {
      expect(isRetryableStatus(400)).toBe(false);
    });

    it('returns false for 401 (Unauthorized)', () => {
      expect(isRetryableStatus(401)).toBe(false);
    });

    it('returns false for 403 (Forbidden)', () => {
      expect(isRetryableStatus(403)).toBe(false);
    });

    it('returns false for 404 (Not Found)', () => {
      expect(isRetryableStatus(404)).toBe(false);
    });

    it('returns false for 200 (OK)', () => {
      expect(isRetryableStatus(200)).toBe(false);
    });
  });

  // ============================================================================
  // getErrorVariant
  // ============================================================================
  describe('getErrorVariant', () => {
    it('returns rate-limit for 429', () => {
      const error: AppError = { message: 'Rate limited', statusCode: 429, retryable: true };
      expect(getErrorVariant(error)).toBe('rate-limit');
    });

    it('returns not-found for 404', () => {
      const error: AppError = { message: 'Not found', statusCode: 404, retryable: false };
      expect(getErrorVariant(error)).toBe('not-found');
    });

    it('returns validation for 4xx (except 404, 429)', () => {
      const error400: AppError = { message: 'Bad request', statusCode: 400, retryable: false };
      const error422: AppError = { message: 'Unprocessable', statusCode: 422, retryable: false };

      expect(getErrorVariant(error400)).toBe('validation');
      expect(getErrorVariant(error422)).toBe('validation');
    });

    it('returns server for 5xx', () => {
      const error500: AppError = { message: 'Server error', statusCode: 500, retryable: true };
      const error503: AppError = { message: 'Unavailable', statusCode: 503, retryable: true };

      expect(getErrorVariant(error500)).toBe('server');
      expect(getErrorVariant(error503)).toBe('server');
    });

    it('returns network for network-related messages', () => {
      const error: AppError = { message: 'Network error', retryable: true };
      expect(getErrorVariant(error)).toBe('network');
    });

    it('returns not-found for not found messages', () => {
      const error: AppError = { message: 'Resource not found', retryable: false };
      expect(getErrorVariant(error)).toBe('not-found');
    });

    it('returns validation for validation messages', () => {
      const error: AppError = { message: 'Field is invalid', retryable: false };
      expect(getErrorVariant(error)).toBe('validation');
    });

    it('handles string input', () => {
      expect(getErrorVariant('Network timeout')).toBe('network');
      expect(getErrorVariant('Not found')).toBe('not-found');
    });
  });

  // ============================================================================
  // Helper functions
  // ============================================================================
  describe('isNetworkError', () => {
    it('detects network-related messages', () => {
      expect(isNetworkError('Network error')).toBe(true);
      expect(isNetworkError('Failed to fetch')).toBe(true);
      expect(isNetworkError('Connection refused')).toBe(true);
      expect(isNetworkError('Request timeout')).toBe(true);
      expect(isNetworkError('offline')).toBe(true);
      expect(isNetworkError('ECONNREFUSED')).toBe(true);
    });

    it('returns false for non-network messages', () => {
      expect(isNetworkError('Invalid input')).toBe(false);
      expect(isNetworkError('Server error')).toBe(false);
    });
  });

  describe('isNotFoundError', () => {
    it('detects not found messages', () => {
      expect(isNotFoundError('Not found')).toBe(true);
      expect(isNotFoundError('404')).toBe(true);
      expect(isNotFoundError('Resource does not exist')).toBe(true);
      expect(isNotFoundError('No longer available')).toBe(true);
    });

    it('returns false for other messages', () => {
      expect(isNotFoundError('Server error')).toBe(false);
      expect(isNotFoundError('Invalid')).toBe(false);
    });
  });

  describe('isValidationError', () => {
    it('detects validation messages', () => {
      expect(isValidationError('Invalid email')).toBe(true);
      expect(isValidationError('Validation failed')).toBe(true);
      expect(isValidationError('Field is required')).toBe(true);
      expect(isValidationError('Value must be a number')).toBe(true);
      expect(isValidationError('Name cannot be empty')).toBe(true);
      expect(isValidationError('Input too long')).toBe(true);
    });

    it('returns false for non-validation messages', () => {
      expect(isValidationError('Server error')).toBe(false);
      expect(isValidationError('Network timeout')).toBe(false);
    });
  });

  describe('isAbortError', () => {
    it('returns true for AbortError', () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      expect(isAbortError(error)).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(isAbortError(new Error('Regular error'))).toBe(false);
      expect(isAbortError('string')).toBe(false);
      expect(isAbortError(null)).toBe(false);
    });
  });

  // ============================================================================
  // createErrorState
  // ============================================================================
  describe('createErrorState', () => {
    it('creates complete error state object', () => {
      const error = new Error('Network failed') as Error & { statusCode: number };
      error.statusCode = 503;

      const state = createErrorState(error);

      expect(state).toHaveProperty('message');
      expect(state).toHaveProperty('type');
      expect(state).toHaveProperty('retryable');
      expect(state.type).toBe('server');
      expect(state.retryable).toBe(true);
    });
  });
});
