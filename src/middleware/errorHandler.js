// src/middleware/errorHandler.js

/**
 * Logs error metadata centrally, ثم يرسل 500 response إلى العميل
 */
export function errorLogger(err, req, res, next) {
  const errorInfo = {
    requestId:     req.requestId,
    timestamp:     new Date().toISOString(),
    method:        req.method,
    path:          req.originalUrl,
    error: {
      message: err.message,
      // أظهر الستاك تريس فقط في التطوير
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    },
    processingTime: `${Date.now() - req.startTime}ms`
  };

  console.error(JSON.stringify(errorInfo));
  res.status(500).json({
    error:   'Internal Server Error',
    errorId: req.requestId
  });
}

/**
 * Wrapper يعزل كل handler ليتم التقاط أي خطأ وإرساله إلى errorLogger
 */
export const wrapAsync = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
