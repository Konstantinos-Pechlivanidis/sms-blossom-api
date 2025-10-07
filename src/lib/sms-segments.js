// src/lib/sms-segments.js
// SMS segmentation calculator for GSM and Unicode

/**
 * Calculate SMS segments and character count
 * @param {string} text - Text to analyze
 * @returns {Object} Segmentation info
 */
export function computeSmsSegments(text) {
  if (!text || typeof text !== 'string') {
    return { parts: 0, chars: 0, unicode: false };
  }

  const unicode = hasUnicode(text);
  const chars = text.length;

  if (unicode) {
    return calculateUnicodeSegments(chars);
  } else {
    return calculateGsmSegments(chars);
  }
}

/**
 * Check if text contains Unicode characters
 * @param {string} text - Text to check
 * @returns {boolean} True if Unicode detected
 */
function hasUnicode(text) {
  // Check for non-GSM characters
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    if (!isGsmCharacter(char)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if character is GSM 7-bit
 * @param {string} char - Character to check
 * @returns {boolean} True if GSM character
 */
function isGsmCharacter(char) {
  const code = char.charCodeAt(0);

  // Basic GSM 7-bit character set
  if (code >= 32 && code <= 126) {
    return true;
  }

  // Extended GSM characters
  const extendedGsm = [
    12, 91, 92, 93, 94, 95, 96, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135,
    136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154,
    155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173,
    174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192,
    193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211,
    212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230,
    231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249,
    250, 251, 252, 253, 254, 255,
  ];

  return extendedGsm.includes(code);
}

/**
 * Calculate segments for Unicode text
 * @param {number} charCount - Character count
 * @returns {Object} Segmentation info
 */
function calculateUnicodeSegments(charCount) {
  if (charCount <= 70) {
    return { parts: 1, chars: charCount, unicode: true };
  } else if (charCount <= 134) {
    return { parts: 2, chars: charCount, unicode: true };
  } else if (charCount <= 201) {
    return { parts: 3, chars: charCount, unicode: true };
  } else {
    // For very long messages, calculate parts
    const parts = Math.ceil(charCount / 67);
    return { parts, chars: charCount, unicode: true };
  }
}

/**
 * Calculate segments for GSM text
 * @param {number} charCount - Character count
 * @returns {Object} Segmentation info
 */
function calculateGsmSegments(charCount) {
  if (charCount <= 160) {
    return { parts: 1, chars: charCount, unicode: false };
  } else if (charCount <= 306) {
    return { parts: 2, chars: charCount, unicode: false };
  } else if (charCount <= 459) {
    return { parts: 3, chars: charCount, unicode: false };
  } else {
    // For very long messages, calculate parts
    const parts = Math.ceil(charCount / 153);
    return { parts, chars: charCount, unicode: false };
  }
}


