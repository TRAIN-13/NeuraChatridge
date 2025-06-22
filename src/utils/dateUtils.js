// src/utils/dateUtils.js
/**
 * يحوّل timestamp (ملّي ثانية) إلى سلسلة مثل "18/06/2025 10:50 AM" بتوقيت Asia/Riyadh
 */
export function formatTimestamp(timestampMs) {
  const date = new Date(timestampMs);
  return date.toLocaleString('en-GB', {
    timeZone: 'Asia/Riyadh',
    day:   '2-digit',
    month: '2-digit',
    year:  'numeric',
    hour:  '2-digit',
    minute:'2-digit',
    hour12: true
  }).replace(',', '');
}
