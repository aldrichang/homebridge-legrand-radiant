import { Logger } from 'homebridge';
import * as https from 'https';
import * as crypto from 'crypto';

/**
 * Azure B2C OAuth configuration for Legrand
 */
const AUTH_CONFIG = {
  // Azure B2C tenant
  tenant: 'eliotclouduamprd.onmicrosoft.com',
  policy: 'B2C_1_ambientwifi_SignUpOrSignIn',

  // OAuth endpoints - base URL
  baseUrl: 'https://login.eliotbylegrand.com',
  authorizeUrl: 'https://login.eliotbylegrand.com/eliotclouduamprd.onmicrosoft.com/b2c_1_ambientwifi_signuporsignin/oauth2/v2.0/authorize',
  tokenUrl: 'https://login.eliotbylegrand.com/eliotclouduamprd.onmicrosoft.com/b2c_1_ambientwifi_signuporsignin/oauth2/v2.0/token',
  selfAssertedUrl: 'https://login.eliotbylegrand.com/eliotclouduamprd.onmicrosoft.com/B2C_1_ambientwifi_SignUpOrSignIn/SelfAsserted',
  confirmedUrl: 'https://login.eliotbylegrand.com/eliotclouduamprd.onmicrosoft.com/B2C_1_ambientwifi_SignUpOrSignIn/api/CombinedSigninAndSignup/confirmed',

  // Client configuration
  clientId: 'd6f3606b-c2fe-4376-a6dd-dd929cbde18d',
  redirectUri: 'msald6f3606b-c2fe-4376-a6dd-dd929cbde18d://auth',
  scopes: 'https://eliotclouduamprd.onmicrosoft.com/security/access.full openid profile offline_access',
};

/**
 * Token response from OAuth
 */
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

/**
 * Legrand Authentication Handler
 *
 * Handles OAuth2 authentication with Azure B2C for the Legrand Smart Lights app
 */
export class LegrandAuth {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(
    private readonly email: string,
    private readonly password: string,
    private readonly log: Logger,
  ) {}

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getAccessToken(): Promise<string> {
    // Check if current token is still valid (with 60s buffer)
    if (this.accessToken && Date.now() < this.tokenExpiry - 60000) {
      return this.accessToken;
    }

    // Try to refresh if we have a refresh token
    if (this.refreshToken) {
      try {
        await this.refreshAccessToken();
        return this.accessToken!;
      } catch (error) {
        this.log.warn(`Token refresh failed: ${error}`);
      }
    }

    // Full authentication
    await this.authenticate();
    return this.accessToken!;
  }

  /**
   * Set tokens manually (for testing or migration)
   */
  setTokens(accessToken: string, refreshToken?: string, expiresIn: number = 3600): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken || null;
    this.tokenExpiry = Date.now() + (expiresIn * 1000);
  }

  /**
   * Check if we have valid credentials
   */
  hasCredentials(): boolean {
    return !!(this.email && this.password);
  }

  /**
   * Perform full OAuth authentication
   *
   * Azure B2C flow:
   * 1. Start authorize request to get session cookies and CSRF token
   * 2. Submit credentials to SelfAsserted endpoint
   * 3. Call confirmed endpoint to complete login
   * 4. Get authorization code from redirect
   * 5. Exchange code for tokens
   */
  private async authenticate(): Promise<void> {
    this.log.info('Authenticating with Legrand cloud...');

    if (!this.email || !this.password) {
      throw new Error('Email and password are required for authentication');
    }

    try {
      // Generate PKCE challenge
      const codeVerifier = this.generateCodeVerifier();
      const codeChallenge = this.generateCodeChallenge(codeVerifier);
      const state = crypto.randomUUID().toUpperCase().replace(/-/g, '');

      this.log.debug('Step 1: Starting authorization flow...');
      const { csrfToken, cookies, tx } = await this.startAuthorization(codeChallenge, state);

      if (!csrfToken || !tx) {
        throw new Error('Failed to get CSRF token or transaction ID from login page');
      }

      this.log.debug('Step 2: Submitting credentials...');
      const updatedCookies = await this.submitCredentials(csrfToken, cookies, tx);

      this.log.debug('Step 3: Confirming login...');
      const authCode = await this.confirmAndGetCode(updatedCookies, tx, csrfToken);

      this.log.debug('Step 4: Exchanging code for tokens...');
      const tokens = await this.exchangeCodeForTokens(authCode, codeVerifier);

      this.accessToken = tokens.access_token;
      this.refreshToken = tokens.refresh_token || null;
      this.tokenExpiry = Date.now() + (tokens.expires_in * 1000);

      this.log.info('Authentication successful!');
    } catch (error) {
      this.log.error(`Authentication failed: ${error}`);
      throw error;
    }
  }

  /**
   * Refresh the access token using refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    this.log.debug('Refreshing access token...');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
      client_id: AUTH_CONFIG.clientId,
      scope: AUTH_CONFIG.scopes,
    }).toString();

    const tokens = await this.postToTokenEndpoint(body);

    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token || this.refreshToken;
    this.tokenExpiry = Date.now() + (tokens.expires_in * 1000);

    this.log.debug('Token refreshed successfully');
  }

  /**
   * Start the authorization flow
   */
  private async startAuthorization(codeChallenge: string, state: string): Promise<{
    csrfToken: string;
    cookies: string[];
    tx: string;
  }> {
    const params = new URLSearchParams({
      'client_id': AUTH_CONFIG.clientId,
      'redirect_uri': AUTH_CONFIG.redirectUri,
      'response_type': 'code',
      'scope': AUTH_CONFIG.scopes,
      'state': state,
      'code_challenge': codeChallenge,
      'code_challenge_method': 'S256',
      'prompt': 'login',
    });

    const url = `${AUTH_CONFIG.authorizeUrl}?${params.toString()}`;

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);

      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)',
        },
      }, (res) => {
        let data = '';
        const cookies: string[] = [];

        // Collect cookies
        const setCookieHeaders = res.headers['set-cookie'];
        if (setCookieHeaders) {
          for (const cookie of setCookieHeaders) {
            cookies.push(cookie.split(';')[0]);
          }
        }

        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          // Extract CSRF token from response
          const csrfMatch = data.match(/name="csrf_token"[^>]*value="([^"]+)"/);
          const csrfToken = csrfMatch ? csrfMatch[1] : '';

          // Extract tx parameter from URL in response
          const txMatch = data.match(/StateProperties=([^"&]+)/);
          const tx = txMatch ? `StateProperties=${txMatch[1]}` : '';

          if (!csrfToken) {
            // Try to get CSRF from cookies
            const csrfCookie = cookies.find(c => c.includes('x-ms-cpim-csrf'));
            if (csrfCookie) {
              const match = csrfCookie.match(/x-ms-cpim-csrf=([^;]+)/);
              if (match) {
                resolve({ csrfToken: match[1], cookies, tx });
                return;
              }
            }
          }

          resolve({ csrfToken, cookies, tx });
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Submit credentials to SelfAsserted endpoint
   * Returns updated cookies including session cookies
   */
  private async submitCredentials(csrfToken: string, cookies: string[], tx: string): Promise<string[]> {
    const body = new URLSearchParams({
      'request_type': 'RESPONSE',
      'logonIdentifier': this.email,
      'password': this.password,
    }).toString();

    const url = `${AUTH_CONFIG.selfAssertedUrl}?${tx}&p=${AUTH_CONFIG.policy}`;

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);

      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-TOKEN': csrfToken,
          'Cookie': cookies.join('; '),
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)',
          'Origin': AUTH_CONFIG.baseUrl,
          'Referer': `${AUTH_CONFIG.authorizeUrl}`,
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';

        // Collect any new cookies
        const updatedCookies = [...cookies];
        const setCookieHeaders = res.headers['set-cookie'];
        if (setCookieHeaders) {
          for (const cookie of setCookieHeaders) {
            const cookiePart = cookie.split(';')[0];
            const cookieName = cookiePart.split('=')[0];
            // Update existing cookie or add new one
            const existingIndex = updatedCookies.findIndex(c => c.startsWith(cookieName + '='));
            if (existingIndex >= 0) {
              updatedCookies[existingIndex] = cookiePart;
            } else {
              updatedCookies.push(cookiePart);
            }
          }
        }

        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            // Check for error in response
            try {
              const json = JSON.parse(data);
              if (json.status === '400' || json.message) {
                reject(new Error(`Login failed: ${json.message || 'Invalid credentials'}`));
                return;
              }
            } catch {
              // Not JSON, that's ok
            }
            resolve(updatedCookies);
          } else {
            reject(new Error(`Credential submission failed: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Call the confirmed endpoint and get the authorization code
   */
  private async confirmAndGetCode(cookies: string[], tx: string, csrfToken: string): Promise<string> {
    const url = `${AUTH_CONFIG.confirmedUrl}?${tx}&p=${AUTH_CONFIG.policy}`;

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);

      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-TOKEN': csrfToken,
          'Cookie': cookies.join('; '),
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)',
          'Referer': `${AUTH_CONFIG.authorizeUrl}`,
        },
      }, (res) => {
        let data = '';

        // Check for redirect with code
        const location = res.headers['location'];
        if (location) {
          const codeMatch = location.match(/code=([^&]+)/);
          if (codeMatch) {
            resolve(decodeURIComponent(codeMatch[1]));
            return;
          }
        }

        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          // Try to find code in response body
          const codeMatch = data.match(/code=([^&"'\s]+)/);
          if (codeMatch) {
            resolve(decodeURIComponent(codeMatch[1]));
            return;
          }

          // Try to find redirect URL in response
          const redirectMatch = data.match(/window\.location\s*=\s*['"]([^'"]+)['"]/);
          if (redirectMatch) {
            const redirectUrl = redirectMatch[1];
            const redirectCodeMatch = redirectUrl.match(/code=([^&]+)/);
            if (redirectCodeMatch) {
              resolve(decodeURIComponent(redirectCodeMatch[1]));
              return;
            }
          }

          // Check if there's an error
          if (data.includes('error')) {
            reject(new Error(`Confirmation failed: ${data.substring(0, 200)}`));
          } else {
            reject(new Error('Could not get authorization code from confirmation response'));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      'grant_type': 'authorization_code',
      'client_id': AUTH_CONFIG.clientId,
      'code': code,
      'redirect_uri': AUTH_CONFIG.redirectUri,
      'code_verifier': codeVerifier,
      'scope': AUTH_CONFIG.scopes,
    }).toString();

    return this.postToTokenEndpoint(body);
  }

  /**
   * Post to token endpoint
   */
  private async postToTokenEndpoint(body: string): Promise<TokenResponse> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(AUTH_CONFIG.tokenUrl);

      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error('Invalid token response'));
            }
          } else {
            reject(new Error(`Token request failed: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Generate PKCE code verifier
   */
  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge from verifier
   */
  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }
}
