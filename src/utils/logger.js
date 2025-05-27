// src/utils/logger.js
import winston from 'winston';

const { combine, timestamp, printf, colorize } = winston.format;

// تنسيق مخصص للسجلات
const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  let log = `${timestamp} [${level}] : ${message}`;
  if (Object.keys(meta).length) {
    log += ` ${JSON.stringify(meta)}`;
  }
  return log;
});

// إنشاء المُسجِّل
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp(),
        logFormat
      )
    })
    // يمكنك إضافة ملفات لرجوع السجلات أو خدمات مركبة إذا لزم الأمر
  ],
  exitOnError: false
});

export default logger;
