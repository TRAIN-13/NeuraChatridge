// src/locales/i18n.js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadLocale(name) {
  const path = resolve(__dirname, `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

const en = loadLocale('en');
const ar = loadLocale('ar');

const locales = { en, ar };

/**
 * @param {string} code     - رمز الخطأ من ERROR_CODES
 * @param {object} params   - قيم للإحلال في القالب، مثلاً { max: 20 }
 * @param {string} locale   - 'en' أو 'ar'
 * @returns {string}
 */
export function getMessage(code, params = {}, locale = 'en') {
  // تأكد من وجود locale بشكل صحيح كـ "en" أو "ar"
  const lang = ['en', 'ar'].includes(locale) ? locale : 'en';

  // اختر ملف اللغة المناسب
  const messages = locales[lang]?.ERRORS || locales.en.ERRORS;

  // ابحث عن الرسالة أو عد إلى كود الخطأ
  let template = messages[code] || locales.en.ERRORS[code] || code;

  // تنفيذ استبدال المتغيرات إذا كان params كائنًا
  if (typeof params === 'object' && params !== null) {
    template = template.replace(/\{(\w+)\}/g, (_, key) =>
      params[key] != null ? params[key] : `{${key}}`
    );
  }

  return template;
}
