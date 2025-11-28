import { dbErrorHandler } from '../../../middleware/errorHandler.js';

/**
 * Handle database errors in controllers.
 * Returns true if the response has been sent.
 */
export function respondWithDbError(res, error) {
  if (!error?.code) {
    return false;
  }

  const handledError = dbErrorHandler(error);
  res.status(handledError.statusCode).json({
    success: false,
    error: handledError.message,
    ...(handledError.details ? { details: handledError.details } : {}),
  });
  return true;
}
