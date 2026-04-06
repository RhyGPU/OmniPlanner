/**
 * Provider capability registry for Phase 21-B hybrid auth.
 *
 * This is the single source of truth for what each email provider supports.
 * Only providers whose OAuth-to-IMAP flow is verified against official
 * documentation are marked as OAuth-capable.
 *
 * Sources consulted:
 *   Gmail XOAUTH2:
 *     https://developers.google.com/gmail/imap/xoauth2-protocol
 *   Outlook IMAP OAuth:
 *     https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/
 *     how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth
 *   Yahoo:
 *     Yahoo requires app passwords for third-party IMAP; IMAP XOAUTH2 is not
 *     documented for independent app registrations as of Phase 21-B.
 *   Naver:
 *     Naver Mail uses standard IMAP credentials; no XOAUTH2 for IMAP.
 *   Daum / Kakao Mail:
 *     Daum Mail uses standard IMAP credentials; no XOAUTH2 for IMAP.
 *
 * DO NOT add OAuth support for a provider without verifying against that
 * provider's official IMAP XOAUTH2 documentation.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** OAuth provider keys — distinct from email provider keys. */
export type OAuthProviderKey = 'google' | 'microsoft';

/** All email provider keys recognised by OmniPlanner. */
export type EmailProviderKey =
  | 'gmail'
  | 'outlook'
  | 'yahoo'
  | 'naver'
  | 'daum'
  | 'custom';

export interface ProviderCapability {
  /** Human-readable display name shown in the UI. */
  displayName: string;

  /** Default IMAP server hostname for this provider. */
  imapHost: string;

  /** Default IMAP port (almost always 993 for TLS). */
  imapPort: number;

  /**
   * Auth methods this provider supports, in priority order.
   * The first entry is the preferred method for new account setup.
   */
  authMethods: ReadonlyArray<'oauth' | 'imap_password'>;

  /**
   * Which OAuth provider key maps to this email provider.
   * Only present when 'oauth' is in authMethods.
   */
  oauthProviderKey?: OAuthProviderKey;

  /**
   * Button label for the OAuth login action, e.g. "Sign in with Google".
   * Only present when 'oauth' is in authMethods.
   */
  oauthButtonLabel?: string;

  /**
   * Whether IMAP authentication with an OAuth access token (XOAUTH2) is
   * supported and verified for this provider.
   * Only present when 'oauth' is in authMethods.
   */
  imapWithOAuth?: true;

  /**
   * Optional setup guidance for providers that require manual steps before
   * IMAP access works (e.g. enabling IMAP, generating an app password).
   * Shown in the UI near the password field.
   */
  setupNote?: string;

  /**
   * True for the 'custom' provider where the user must supply their own
   * IMAP host and port.
   */
  requiresManualHost?: true;
}

// ---------------------------------------------------------------------------
// Capability matrix
// ---------------------------------------------------------------------------

/**
 * Explicit, per-provider capability declarations.
 *
 * Keep this list honest: unsupported capabilities must never be listed here
 * to avoid creating confusing half-working UI paths.
 */
export const PROVIDER_CAPABILITIES: Record<EmailProviderKey, ProviderCapability> = {
  gmail: {
    displayName: 'Gmail',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    // Google documents XOAUTH2 for IMAP and provides a standard OAuth 2.0 flow.
    authMethods: ['oauth', 'imap_password'],
    oauthProviderKey: 'google',
    oauthButtonLabel: 'Sign in with Google',
    imapWithOAuth: true,
    setupNote: 'If using an app password, generate one in your Google Account → Security → App passwords.',
  },
  outlook: {
    displayName: 'Outlook / Microsoft 365',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    // Microsoft documents OAuth 2.0 IMAP authentication for Outlook and Exchange Online.
    authMethods: ['oauth', 'imap_password'],
    oauthProviderKey: 'microsoft',
    oauthButtonLabel: 'Sign in with Microsoft',
    imapWithOAuth: true,
    setupNote: 'If using an app password, generate one in your Microsoft account security settings.',
  },
  yahoo: {
    displayName: 'Yahoo Mail',
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    // Yahoo IMAP XOAUTH2 is not documented for third-party app registrations.
    // App passwords are the supported path for independent apps.
    authMethods: ['imap_password'],
    setupNote: 'Yahoo requires an app password. Generate one in Yahoo Account Security settings, then enable IMAP under Mail settings.',
  },
  naver: {
    displayName: 'Naver Mail',
    imapHost: 'imap.naver.com',
    imapPort: 993,
    // Naver Mail does not support IMAP XOAUTH2 for third-party apps.
    authMethods: ['imap_password'],
    setupNote: 'Enable IMAP in Naver Mail settings (환경설정 → POP3/IMAP 설정) before connecting.',
  },
  daum: {
    displayName: 'Daum / Kakao Mail',
    imapHost: 'imap.daum.net',
    imapPort: 993,
    // Daum Mail does not support IMAP XOAUTH2 for third-party apps.
    authMethods: ['imap_password'],
    setupNote: 'Enable IMAP in Daum Mail settings before connecting.',
  },
  custom: {
    displayName: 'Custom IMAP',
    imapHost: '',
    imapPort: 993,
    authMethods: ['imap_password'],
    requiresManualHost: true,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if this provider has a verified OAuth login path. */
export function providerSupportsOAuth(provider: EmailProviderKey): boolean {
  return PROVIDER_CAPABILITIES[provider].authMethods.includes('oauth');
}

/** Returns the OAuth provider key for a given email provider, or null if unsupported. */
export function getOAuthProviderKey(provider: EmailProviderKey): OAuthProviderKey | null {
  return PROVIDER_CAPABILITIES[provider].oauthProviderKey ?? null;
}
