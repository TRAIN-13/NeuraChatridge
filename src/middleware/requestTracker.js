// src/middleware/requestTracker.js

import { v4 as uuidv4 } from 'uuid';

/**
 * توليد معرف فريد لكل طلب لتتبع الأخطاء
 * ويحسب وقت البداية لقياس زمن المعالجة لاحقًا.
 */
export function requestTracker(req, res, next) {
  req.requestId = uuidv4().substring(0, 8);
  req.startTime = Date.now();
  next();
}
