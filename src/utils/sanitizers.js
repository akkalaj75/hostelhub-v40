/**
 * Advanced contact info detection
 */
export function detectContactInfo(text) {
  const lowercaseText = text.toLowerCase();
  
  // Phone number patterns (various formats)
  const phonePatterns = [
    /\b\d{10}\b/,                           // 1234567890
    /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,  // 123-456-7890
    /\b\d{5}[\s]?\d{5}\b/,                 // 12345 67890 (India)
    /\b\+\d{1,3}[\s-]?\d{8,12}\b/,        // +91 1234567890
  ];
  
  // Email patterns
  const emailPattern = /@[\w]+\.[\w]+/;
  
  // Social media patterns
  const socialPatterns = [
    /\b(instagram|insta|ig)[\s:@]*[\w.]+/i,
    /\b(facebook|fb)[\s:@\/]*[\w.]+/i,
    /\b(whatsapp|whats\s*app|wa)[\s:@]*[\w.]+/i,
    /\b(snapchat|snap)[\s:@]*[\w.]+/i,
    /\b(telegram|tele)[\s:@]*[\w.]+/i,
    /\b(twitter|x)[\s:@]*[\w.]+/i,
    /\b(discord)[\s:@#]*[\w.]+/i,
    /\b(tiktok|tik\s*tok)[\s:@]*[\w.]+/i,
  ];
  
  // Obfuscation bypass patterns
  const obfuscationPatterns = [
    /\b(dm|d\s*m)\s*(me|m3)\b/i,           // dm me
    /\b(text|txt)\s*(me|m3)\b/i,           // text me
    /\b(call|cal1)\s*(me|m3)\b/i,          // call me
    /\b(add|ad)\s*(me|m3)\b/i,             // add me
    /\bat\s*the\s*rate/i,                   // "at the rate" for @
    /\bdot\s*com/i,                         // "dot com"
    /\b(zero|one|two|three|four|five|six|seven|eight|nine)\s*\d/i, // "nine 1 2 3..."
  ];
  
  // Check all patterns
  if (phonePatterns.some(pattern => pattern.test(text))) return true;
  if (emailPattern.test(text)) return true;
  if (socialPatterns.some(pattern => pattern.test(lowercaseText))) return true;
  if (obfuscationPatterns.some(pattern => pattern.test(lowercaseText))) return true;
  
  // Check for repeated digits (potential phone numbers)
  const digitCount = (text.match(/\d/g) || []).length;
  if (digitCount >= 8) return true;
  
  return false;
}

/**
 * Detect abusive/inappropriate content
 */
export function detectAbusiveContent(text) {
  const lowercaseText = text.toLowerCase();
  
  // Profanity and slurs (sample - expand as needed)
  const profanityList = [
    'fuck', 'shit', 'bitch', 'asshole', 'bastard',
    'damn', 'crap', 'piss', 'slut', 'whore',
    // Add more carefully curated words
  ];
  
  // Sexual content keywords
  const sexualKeywords = [
    'nudes', 'nude', 'dick pic', 'send pic',
    'sex', 'sexy', 'hot pic', 'boobs', 'ass pic',
    // Add more carefully
  ];
  
  // Harassment patterns
  const harassmentPatterns = [
    /\bkill\s*(yourself|urself)\b/i,
    /\bgo\s*die\b/i,
    /\bkys\b/i,
    /\bhang\s*yourself\b/i,
  ];
  
  let severity = 0;
  const reasons = [];
  
  // Check profanity
  for (const word of profanityList) {
    if (lowercaseText.includes(word)) {
      severity += 1;
      reasons.push('profanity');
      break;
    }
  }
  
  // Check sexual content
  for (const keyword of sexualKeywords) {
    if (lowercaseText.includes(keyword)) {
      severity += 2;
      reasons.push('sexual');
      break;
    }
  }
  
  // Check harassment
  for (const pattern of harassmentPatterns) {
    if (pattern.test(lowercaseText)) {
      severity += 3;
      reasons.push('harassment');
      break;
    }
  }
  
  // ALL CAPS detection (likely shouting)
  const uppercaseRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (uppercaseRatio > 0.7 && text.length > 10) {
    severity += 0.5;
    reasons.push('caps');
  }
  
  return {
    isAbusive: severity >= 1,
    severity,
    reasons,
    shouldAutoBlock: severity >= 3
  };
}

/**
 * Sanitize user input
 */
export function sanitizeInput(text) {
  if (!text) return '';
  
  return text
    .trim()
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .substring(0, 500);
}