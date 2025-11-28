import { dbErrorHandler } from '../../../middleware/errorHandler.js';

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
