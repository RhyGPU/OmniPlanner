/**
 * Email error taxonomy — Phase 22.
 *
 * Stable error codes, structured error type, user-facing messages, and
 * helper functions for all email-related workflows.
 *
 * Design rules:
 *   - Codes are stable string constants. Never rename a shipped code.
 *   - The string values here must match the strings in electron-main.cjs
 *     (classifyImapError). Since electron-main.cjs is CommonJS and cannot
 *     import this file, both sides use the same literals.
 *   - userMessage is always calm, actionable, and free of raw technical terms.
 *   - Never include secrets, passwords, or full stack traces in messages.
 */

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export const EMAIL_ERROR_CODES = {
  // Platform / availability
  EMAIL_PLATFORM_UNAVAILABLE:         'EMAIL_PLATFORM_UNAVAILABLE',
  EMAIL_DESKTOP_REQUIRED:             'EMAIL_DESKTOP_REQUIRED',

  // Configuration / credential
  EMAIL_ACCOUNT_NOT_FOUND:            'EMAIL_ACCOUNT_NOT_FOUND',
  EMAIL_CREDENTIAL_MISSING:           'EMAIL_CREDENTIAL_MISSING',
  EMAIL_CREDENTIAL_LOAD_FAILED:       'EMAIL_CREDENTIAL_LOAD_FAILED',
  EMAIL_INVALID_CONFIG:               'EMAIL_INVALID_CONFIG',

  // Connection / network
  EMAIL_NETWORK_TIMEOUT:              'EMAIL_NETWORK_TIMEOUT',
  EMAIL_DNS_FAILURE:                  'EMAIL_DNS_FAILURE',
  EMAIL_CONNECTION_REFUSED:           'EMAIL_CONNECTION_REFUSED',
  EMAIL_TLS_HANDSHAKE_FAILED:         'EMAIL_TLS_HANDSHAKE_FAILED',

  // Authentication / authorization
  EMAIL_AUTH_FAILED:                  'EMAIL_AUTH_FAILED',
  EMAIL_AUTH_LOCKED:                  'EMAIL_AUTH_LOCKED',
  EMAIL_APP_PASSWORD_REQUIRED:        'EMAIL_APP_PASSWORD_REQUIRED',
  EMAIL_IMAP_DISABLED:                'EMAIL_IMAP_DISABLED',

  // Protocol / mailbox
  EMAIL_IMAP_SELECT_FAILED:           'EMAIL_IMAP_SELECT_FAILED',
  EMAIL_IMAP_FETCH_FAILED:            'EMAIL_IMAP_FETCH_FAILED',
  EMAIL_IMAP_SEARCH_FAILED:           'EMAIL_IMAP_SEARCH_FAILED',
  EMAIL_MAILBOX_NOT_FOUND:            'EMAIL_MAILBOX_NOT_FOUND',

  // Parse / content
  EMAIL_BODY_PARSE_FAILED:            'EMAIL_BODY_PARSE_FAILED',
  EMAIL_MESSAGE_MALFORMED:            'EMAIL_MESSAGE_MALFORMED',
  EMAIL_ATTACHMENT_PARSE_FAILED:      'EMAIL_ATTACHMENT_PARSE_FAILED',

  // AI / extraction
  EMAIL_AI_UNAVAILABLE:               'EMAIL_AI_UNAVAILABLE',
  EMAIL_AI_MISSING_KEY:               'EMAIL_AI_MISSING_KEY',
  EMAIL_EVENT_EXTRACTION_FAILED:      'EMAIL_EVENT_EXTRACTION_FAILED',
  EMAIL_EVENT_EXTRACTION_INVALID_JSON:'EMAIL_EVENT_EXTRACTION_INVALID_JSON',

  // Calendar handoff
  EMAIL_CALENDAR_CREATE_FAILED:       'EMAIL_CALENDAR_CREATE_FAILED',
  EMAIL_EVENT_PREVIEW_INVALID:        'EMAIL_EVENT_PREVIEW_INVALID',

  // OAuth 2.0 login flow (Phase 21-B)
  // These codes are stable — do not rename shipped values.
  EMAIL_OAUTH_PLATFORM_UNAVAILABLE:   'EMAIL_OAUTH_PLATFORM_UNAVAILABLE',
  EMAIL_OAUTH_PROVIDER_UNSUPPORTED:   'EMAIL_OAUTH_PROVIDER_UNSUPPORTED',
  EMAIL_OAUTH_CANCELLED:              'EMAIL_OAUTH_CANCELLED',
  EMAIL_OAUTH_CALLBACK_FAILED:        'EMAIL_OAUTH_CALLBACK_FAILED',
  EMAIL_OAUTH_TOKEN_EXCHANGE_FAILED:  'EMAIL_OAUTH_TOKEN_EXCHANGE_FAILED',
  EMAIL_OAUTH_SCOPE_DENIED:           'EMAIL_OAUTH_SCOPE_DENIED',
  EMAIL_OAUTH_STORAGE_FAILED:         'EMAIL_OAUTH_STORAGE_FAILED',
  EMAIL_OAUTH_IMAP_UNSUPPORTED:       'EMAIL_OAUTH_IMAP_UNSUPPORTED',
} as const;

export type EmailErrorCode = typeof EMAIL_ERROR_CODES[keyof typeof EMAIL_ERROR_CODES];

// ---------------------------------------------------------------------------
// Structured error interface (for return shapes and diagnostics)
// ---------------------------------------------------------------------------

/**
 * Structured context for an email operation failure.
 * Intended for logging and debugging — never surfaces raw to users.
 */
export interface EmailOperationError {
  /** Stable error code. */
  code: EmailErrorCode;
  /** Technical message for logs. May be the original error.message. */
  message: string;
  /** Calm, user-facing message. Use getEmailUserMessage() to derive. */
  userMessage: string;
  /** True for network/timeout failures where retrying is reasonable. */
  retryable: boolean;
  /** Short operation trace ID, e.g. "email-fetch-1j3kx2". */
  operationId: string;
  /** Non-sensitive context: accountId, provider, phase, count, etc. */
  context?: Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------------
// EmailError class — thrown by email-related service functions
// ---------------------------------------------------------------------------

/**
 * Typed error thrown by email service functions.
 *
 * Use this (not generic Error) in email workflows so callers can branch on
 * `code` and surface the right user message. Never include secrets in `message`.
 */
export class EmailError extends Error {
  readonly code: EmailErrorCode;
  readonly operationId: string;

  constructor(code: EmailErrorCode, message: string, operationId = '') {
    super(message);
    this.name = 'EmailError';
    this.code = code;
    this.operationId = operationId;
  }
}

// ---------------------------------------------------------------------------
// User-facing message map
// ---------------------------------------------------------------------------

/**
 * Calm, actionable one-sentence messages for each error code.
 * Written for end users, not developers.
 */
const EMAIL_USER_MESSAGES: Record<EmailErrorCode, string> = {
  // Platform
  EMAIL_PLATFORM_UNAVAILABLE:
    'Email is unavailable on this platform.',
  EMAIL_DESKTOP_REQUIRED:
    'Email requires the desktop app. Open OmniPlanner on your computer to use this feature.',

  // Configuration / credential
  EMAIL_ACCOUNT_NOT_FOUND:
    'Account not found. It may have been removed. Add it again in Settings → Email Accounts.',
  EMAIL_CREDENTIAL_MISSING:
    'No password stored for this account. Re-enter it in Settings → Email Accounts.',
  EMAIL_CREDENTIAL_LOAD_FAILED:
    'Could not load stored credentials. Restart the app and try again.',
  EMAIL_INVALID_CONFIG:
    'Account configuration is incomplete. Check the host and port in Settings → Email Accounts.',

  // Connection / network
  EMAIL_NETWORK_TIMEOUT:
    'Connection timed out. The mail server may be unreachable — check your network.',
  EMAIL_DNS_FAILURE:
    'Could not reach the mail server. Check your internet connection.',
  EMAIL_CONNECTION_REFUSED:
    'Server refused the connection. Verify the IMAP host and port in Settings.',
  EMAIL_TLS_HANDSHAKE_FAILED:
    'Secure connection failed. The server certificate may be invalid or expired.',

  // Authentication / authorization
  EMAIL_AUTH_FAILED:
    'Authentication failed. Check your app password in Settings → Email Accounts.',
  EMAIL_AUTH_LOCKED:
    'Account temporarily locked after too many attempts. Wait a few minutes and try again.',
  EMAIL_APP_PASSWORD_REQUIRED:
    'This account requires an app-specific password. Generate one in your email provider settings.',
  EMAIL_IMAP_DISABLED:
    'IMAP access is disabled for this account. Enable it in your email provider settings.',

  // Protocol / mailbox
  EMAIL_IMAP_SELECT_FAILED:
    'Could not open the inbox. The mailbox may be temporarily unavailable.',
  EMAIL_IMAP_FETCH_FAILED:
    'Failed to fetch email. Check your account settings and try again.',
  EMAIL_IMAP_SEARCH_FAILED:
    'Email search failed. Try again or check your account settings.',
  EMAIL_MAILBOX_NOT_FOUND:
    'Inbox not found. The mailbox name may have changed.',

  // Parse / content
  EMAIL_BODY_PARSE_FAILED:
    'Could not read this email. The message format may be unsupported.',
  EMAIL_MESSAGE_MALFORMED:
    'This email appears to be malformed and could not be displayed.',
  EMAIL_ATTACHMENT_PARSE_FAILED:
    'Could not read an attachment in this email.',

  // AI / extraction
  EMAIL_AI_UNAVAILABLE:
    'AI is not configured. Set up a provider in Settings → AI to use this feature.',
  EMAIL_AI_MISSING_KEY:
    'AI API key is missing. Add your key in Settings → AI.',
  EMAIL_EVENT_EXTRACTION_FAILED:
    'Could not extract an event from this email. Try again or check your AI settings.',
  EMAIL_EVENT_EXTRACTION_INVALID_JSON:
    'AI returned an unexpected format. Try again — this usually resolves on retry.',

  // Calendar handoff
  EMAIL_CALENDAR_CREATE_FAILED:
    'Could not add the event to the calendar. Try again.',
  EMAIL_EVENT_PREVIEW_INVALID:
    'The extracted event is missing required fields. Try again.',

  // OAuth 2.0 login flow
  EMAIL_OAUTH_PLATFORM_UNAVAILABLE:
    'Sign-in with a provider account requires the desktop app.',
  EMAIL_OAUTH_PROVIDER_UNSUPPORTED:
    'This provider is not configured for sign-in. Use an app password instead.',
  EMAIL_OAUTH_CANCELLED:
    'Sign-in was cancelled. Try again when ready.',
  EMAIL_OAUTH_CALLBACK_FAILED:
    'Sign-in did not complete successfully. Close any extra browser tabs and try again.',
  EMAIL_OAUTH_TOKEN_EXCHANGE_FAILED:
    'Could not complete sign-in with the provider. Check your network and try again.',
  EMAIL_OAUTH_SCOPE_DENIED:
    'Mail access was not granted. Sign in again and allow mail access when prompted.',
  EMAIL_OAUTH_STORAGE_FAILED:
    'Sign-in succeeded but credentials could not be saved securely. Restart the app and try again.',
  EMAIL_OAUTH_IMAP_UNSUPPORTED:
    'This provider account does not support IMAP access via sign-in. Use an app password instead.',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the calm user-facing message for a given error code.
 * Falls back to a generic message for unknown codes or undefined input.
 */
export function getEmailUserMessage(code: string | undefined): string {
  if (!code) return 'An email error occurred. Check your account settings and try again.';
  return (
    EMAIL_USER_MESSAGES[code as EmailErrorCode] ??
    'An email error occurred. Check your account settings and try again.'
  );
}

/**
 * Returns true for failure codes where retrying the operation is reasonable
 * (network timeouts, transient server errors). False for configuration or
 * credential errors that require user action before retrying.
 */
export function isEmailErrorRetryable(code: string): boolean {
  const retryable = new Set<string>([
    EMAIL_ERROR_CODES.EMAIL_NETWORK_TIMEOUT,
    EMAIL_ERROR_CODES.EMAIL_DNS_FAILURE,
    EMAIL_ERROR_CODES.EMAIL_CONNECTION_REFUSED,
    EMAIL_ERROR_CODES.EMAIL_TLS_HANDSHAKE_FAILED,
    EMAIL_ERROR_CODES.EMAIL_IMAP_SELECT_FAILED,
    EMAIL_ERROR_CODES.EMAIL_IMAP_FETCH_FAILED,
    EMAIL_ERROR_CODES.EMAIL_IMAP_SEARCH_FAILED,
    EMAIL_ERROR_CODES.EMAIL_EVENT_EXTRACTION_FAILED,
    EMAIL_ERROR_CODES.EMAIL_EVENT_EXTRACTION_INVALID_JSON,
  ]);
  return retryable.has(code);
}

/**
 * Generate a short operation ID for tracing a single email workflow run.
 * Format: `${prefix}-${timestamp base-36}`, e.g. `email-fetch-1j3kx2`.
 *
 * Attach this to log lines and to the response/error so a user can report
 * the ID and a developer can grep for it.
 */
export function makeEmailOperationId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}
