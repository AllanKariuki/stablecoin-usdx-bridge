/**
 * General formatting utilities
 */

import { format, formatDistanceToNow, parseISO } from 'date-fns';

/**
 * Format ISO date string to human-readable format
 * 
 * @example
 * formatDate('2024-01-15T10:30:00Z') // "Jan 15, 2024"
 * formatDate('2024-01-15T10:30:00Z', 'PPpp') // "Jan 15, 2024, 10:30:00 AM"
 */
export function formatDate(dateString: string, formatString: string = 'PPP'): string {
  try {
    const date = parseISO(dateString);
    return format(date, formatString);
  } catch {
    return dateString;
  }
}

/**
 * Format ISO date to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(dateString: string): string {
  try {
    const date = parseISO(dateString);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return dateString;
  }
}

/**
 * Format timestamp to time only
 * 
 * @example
 * formatTime('2024-01-15T10:30:00Z') // "10:30 AM"
 */
export function formatTime(dateString: string): string {
  return formatDate(dateString, 'p');
}

/**
 * Format number with thousands separators
 * 
 * @example
 * formatNumber(1234567.89) // "1,234,567.89"
 */
export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {}
): string {
  return new Intl.NumberFormat('en-US', options).format(value);
}

/**
 * Truncate string with ellipsis
 * 
 * @example
 * truncate('Hello World', 5) // "Hello..."
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

/**
 * Truncate middle of string (useful for addresses)
 * 
 * @example
 * truncateMiddle('0x1234567890abcdef', 6, 4) // "0x1234...cdef"
 */
export function truncateMiddle(
  str: string,
  startChars: number,
  endChars: number
): string {
  if (str.length <= startChars + endChars) return str;
  return `${str.slice(0, startChars)}...${str.slice(-endChars)}`;
}

/**
 * Format file size
 * 
 * @example
 * formatFileSize(1024) // "1 KB"
 * formatFileSize(1048576) // "1 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Convert snake_case to Title Case
 */
export function snakeToTitle(str: string): string {
  return str
    .split('_')
    .map(word => capitalize(word))
    .join(' ');
}

/**
 * Format blockchain address with ellipsis
 */
export function formatAddress(address: string, chars: number = 6): string {
  return truncateMiddle(address, chars, chars);
}

/**
 * Format transaction hash
 */
export function formatTxHash(hash: string): string {
  return truncateMiddle(hash, 8, 8);
}
