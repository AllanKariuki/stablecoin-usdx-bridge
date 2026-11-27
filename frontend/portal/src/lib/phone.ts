/**
 * A Kenyan mobile number in the international form Daraja expects:
 * 254 followed by a 7xx or 1xx subscriber number (12 digits, no plus).
 */
export const isKenyanMobile = (value: string) => /^254[17]\d{8}$/.test(value.trim());
