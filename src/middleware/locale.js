// src/middleware/locale.js
export function localeMiddleware(req, res, next) {
  // تأكد من وجود req.body ككائن
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // 1. جرّب من body.language
  let lang = body.language;

  // 2. أو من هيدر Accept-Language
  if (!lang && typeof req.headers['accept-language'] === 'string') {
    lang = req.headers['accept-language']
      .split(',')
      [0].trim()
      .slice(0, 2);
  }

  // 3. افتراضيًا 'en' إذا ليست en أو ar
  req.locale = ['en', 'ar'].includes(lang) ? lang : 'en';
  next();
}
