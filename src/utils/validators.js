/**
 * Validate email format
 */
export function validateEmail(email) {
  if (!email) return { valid: false, message: 'Email is required' };
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(email)) {
    return { valid: false, message: 'Invalid email format' };
  }
  
  return { valid: true };
}

/**
 * Validate password strength
 */
export function validatePassword(password) {
  if (!password) return { valid: false, message: 'Password is required' };
  
  if (password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters' };
  }
  
  // Optional: stronger validation
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  
  if (!hasLetter || !hasNumber) {
    return { 
      valid: false, 
      message: 'Password should contain letters and numbers' 
    };
  }
  
  return { valid: true };
}

/**
 * Validate interest tag
 */
export function validateInterest(interest) {
  if (!interest) return { valid: false, message: 'Interest cannot be empty' };
  
  const trimmed = interest.trim();
  
  if (trimmed.length < 2) {
    return { valid: false, message: 'Interest too short' };
  }
  
  if (trimmed.length > 20) {
    return { valid: false, message: 'Interest too long (max 20 chars)' };
  }
  
  // Only alphanumeric and spaces
  if (!/^[a-zA-Z0-9\s]+$/.test(trimmed)) {
    return { valid: false, message: 'Only letters and numbers allowed' };
  }
  
  return { valid: true, value: trimmed.toLowerCase() };
}