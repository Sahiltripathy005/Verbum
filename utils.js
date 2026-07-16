/**
 * WordVault Utility Helpers
 */

/**
 * Format a timestamp into a human-readable relative or localized date string.
 * @param {number} timestamp - Epoch timestamp in milliseconds.
 * @returns {string} Formatted date.
 */
export function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  
  const now = Date.now();
  const diffMs = now - timestamp;
  
  // Under a minute
  if (diffMs < 60000) {
    return 'Just now';
  }
  
  // Under an hour
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  
  // Under a day
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  
  // Under 7 days
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  
  // Otherwise return localized date
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Escape HTML special characters to prevent cross-site scripting (XSS).
 * @param {string} str - Unsafe string.
 * @returns {string} Safe escaped HTML string.
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Truncate a string to a specified length and append an ellipsis.
 * @param {string} str - Input string.
 * @param {number} maxLength - Maximum allowed length.
 * @returns {string} Truncated string.
 */
export function truncate(str, maxLength = 100) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength).trim() + '...';
}
