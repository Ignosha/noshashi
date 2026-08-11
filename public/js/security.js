/* IGNOSHASHI - Security utilities */
(function (global) {
  'use strict';

  function sanitize(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .slice(0, 10000);
  }

  function sanitizeHtml(html) {
    if (typeof html !== 'string') return '';
    return html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .slice(0, 10000);
  }

  function isValidAddress(addr, network) {
    if (!addr || typeof addr !== 'string') return false;
    if (network === 'ethereum') return /^0x[a-fA-F0-9]{40}$/.test(addr);
    if (network === 'solana') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
    return addr.length >= 26;
  }

  function isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  function generateSecureToken(length = 32) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }

  function validateInput(input, type) {
    const sanitized = sanitize(input);
    switch (type) {
      case 'address':
        return isValidAddress(sanitized, 'solana') || isValidAddress(sanitized, 'ethereum');
      case 'url':
        return isValidUrl(sanitized);
      case 'number':
        const num = Number(sanitized);
        return !isNaN(num) && isFinite(num);
      default:
        return sanitized.length > 0;
    }
  }

  global.Security = {
    sanitize,
    sanitizeHtml,
    isValidAddress,
    isValidUrl,
    generateSecureToken,
    validateInput,
  };
})(window);
