/**
 * Random Shosha Bot - Auto-posting bot for X (Twitter) and Bluesky
 * All code in one file for Google Apps Script compatibility
 */

// ============================================================================
// Type Definitions
// ============================================================================

interface BaseSentenceMetadata {
  sentence_text: string;
  book_id: string;
  sentence_id: number;
  title: string;
  author: string;
}

interface JapaneseSentenceResponse extends BaseSentenceMetadata {
  char_count: number;
  card_url: string;
}

interface EnglishSentenceResponse extends BaseSentenceMetadata {
  word_count: number;
}

type Language = 'ja' | 'en';

interface ShareContent {
  text: string;
  url: string;
}

interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

interface BlueskyCredentials {
  identifier: string;
  password: string;
}

// ============================================================================
// API Functions
// ============================================================================

const JAPANESE_API_URL = 'https://rmc-8.com/api/random-shosha';
const ENGLISH_API_URL = 'https://rmc-8.com/api/random-shosha-en';

function fetchJapaneseSentence(): JapaneseSentenceResponse {
  try {
    const response = UrlFetchApp.fetch(JAPANESE_API_URL);
    const data = JSON.parse(response.getContentText()) as JapaneseSentenceResponse;
    Logger.log(`Fetched Japanese sentence: ${data.title} - ${data.author}`);
    return data;
  } catch (error) {
    Logger.log(`Japanese API fetch error: ${error}`);
    throw new Error('Failed to fetch data from Japanese API');
  }
}

function fetchEnglishSentence(): EnglishSentenceResponse {
  try {
    const response = UrlFetchApp.fetch(ENGLISH_API_URL);
    const data = JSON.parse(response.getContentText()) as EnglishSentenceResponse;
    Logger.log(`Fetched English sentence: ${data.title} - ${data.author}`);
    return data;
  } catch (error) {
    Logger.log(`English API fetch error: ${error}`);
    throw new Error('Failed to fetch data from English API');
  }
}

// ============================================================================
// URL Generation Functions
// ============================================================================

function generateShareUrl(bookId: string, sentenceId: number, lang: Language): string {
  const encodedBookId = encodeURIComponent(bookId);
  if (lang === 'en') {
    return `https://rmc-8.com/shosha/random_shosha_en/?book_id=${encodedBookId}&sentence_id=${sentenceId}`;
  }
  return `https://rmc-8.com/shosha/random_shosha/?book_id=${encodedBookId}&sentence_id=${sentenceId}`;
}

function generateHashtags(bookId: string, sentenceId: number): string {
  const cleanBookId = bookId.replace(/-/g, '');
  return `#random_shosha #${cleanBookId}_${sentenceId}`;
}

function generateJapaneseShareContent(data: JapaneseSentenceResponse): ShareContent {
  const shareUrl = generateShareUrl(data.book_id, data.sentence_id, 'ja');
  const hashtags = generateHashtags(data.book_id, data.sentence_id);
  const text = `『${data.title}』${data.author}著\n${hashtags}\n${shareUrl}`;
  return { text, url: shareUrl };
}

function generateEnglishShareContent(data: EnglishSentenceResponse): ShareContent {
  const shareUrl = generateShareUrl(data.book_id, data.sentence_id, 'en');
  const hashtags = generateHashtags(data.book_id, data.sentence_id);
  const text = `"${data.title}" by ${data.author}\n${hashtags}\n${shareUrl}`;
  return { text, url: shareUrl };
}

// ============================================================================
// X (Twitter) Functions
// ============================================================================

function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key]!)}`)
    .join('&');

  const signatureBaseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams),
  ].join('&');

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;

  const signature = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_1,
    signatureBaseString,
    signingKey
  );

  return Utilities.base64Encode(signature);
}

function generateOAuthHeader(
  method: string,
  url: string,
  params: Record<string, string>,
  credentials: XCredentials
): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = Utilities.getUuid();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_token: credentials.accessToken,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_nonce: nonce,
    oauth_version: '1.0',
    ...params,
  };

  const signature = generateOAuthSignature(
    method,
    url,
    oauthParams,
    credentials.apiSecret,
    credentials.accessTokenSecret
  );

  oauthParams.oauth_signature = signature;

  const headerParams = Object.keys(oauthParams)
    .filter((key) => key.startsWith('oauth_'))
    .sort()
    .map((key) => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key]!)}"`)
    .join(', ');

  return `OAuth ${headerParams}`;
}

function postToX(text: string, credentials: XCredentials): boolean {
  const url = 'https://api.twitter.com/2/tweets';
  const method = 'POST';

  try {
    const payload = { text };
    const payloadString = JSON.stringify(payload);
    const authHeader = generateOAuthHeader(method, url, {}, credentials);

    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: authHeader,
      },
      payload: payloadString,
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode === 201) {
      Logger.log(`X post successful: ${responseText}`);
      return true;
    } else {
      Logger.log(`X post failed (${responseCode}): ${responseText}`);
      return false;
    }
  } catch (error) {
    Logger.log(`X post error: ${error}`);
    return false;
  }
}

// ============================================================================
// Bluesky Functions
// ============================================================================

const BLUESKY_API_BASE = 'https://bsky.social/xrpc';

function createBlueskySession(credentials: BlueskyCredentials): string | null {
  const url = `${BLUESKY_API_BASE}/com.atproto.server.createSession`;

  try {
    const payload = {
      identifier: credentials.identifier,
      password: credentials.password,
    };

    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      const data = JSON.parse(response.getContentText());
      Logger.log('Bluesky session created successfully');
      return data.accessJwt;
    } else {
      Logger.log(`Bluesky session creation failed (${responseCode}): ${response.getContentText()}`);
      return null;
    }
  } catch (error) {
    Logger.log(`Bluesky session creation error: ${error}`);
    return null;
  }
}

function extractFacets(text: string): Array<{
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: string; uri: string }>;
}> {
  const facets: Array<{
    index: { byteStart: number; byteEnd: number };
    features: Array<{ $type: string; uri: string }>;
  }> = [];

  const urlRegex = /https?:\/\/[^\s]+/g;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0];
    const byteStart = Utilities.newBlob(text.substring(0, match.index)).getBytes().length;
    const byteEnd = byteStart + Utilities.newBlob(url).getBytes().length;

    facets.push({
      index: { byteStart, byteEnd },
      features: [
        {
          $type: 'app.bsky.richtext.facet#link',
          uri: url,
        },
      ],
    });
  }

  return facets;
}

function postToBluesky(
  text: string,
  credentials: BlueskyCredentials,
  shareUrl?: string,
  ogpTitle?: string,
  ogpDescription?: string
): boolean {
  const accessJwt = createBlueskySession(credentials);

  if (!accessJwt) {
    Logger.log('Bluesky authentication failed');
    return false;
  }

  const url = `${BLUESKY_API_BASE}/com.atproto.repo.createRecord`;

  try {
    const now = new Date().toISOString();
    const facets = extractFacets(text);

    const record: any = {
      $type: 'app.bsky.feed.post',
      text: text,
      createdAt: now,
      ...(facets.length > 0 && { facets }),
    };

    if (shareUrl) {
      record.embed = {
        $type: 'app.bsky.embed.external',
        external: {
          uri: shareUrl,
          title: ogpTitle || 'Random Shosha - 書写のお題',
          description: ogpDescription || '古典文学の一文を書写のお題として',
        },
      };
      Logger.log(`Adding OGP card for URL: ${shareUrl}`);
    }

    const payload = {
      repo: credentials.identifier,
      collection: 'app.bsky.feed.post',
      record: record,
    };

    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${accessJwt}`,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode === 200) {
      Logger.log(`Bluesky post successful: ${responseText}`);
      return true;
    } else {
      Logger.log(`Bluesky post failed (${responseCode}): ${responseText}`);
      return false;
    }
  } catch (error) {
    Logger.log(`Bluesky post error: ${error}`);
    return false;
  }
}

// ============================================================================
// Credentials Functions
// ============================================================================

function getJapaneseXCredentials(): XCredentials {
  const properties = PropertiesService.getScriptProperties();
  return {
    apiKey: properties.getProperty('X_RND_SHOSHA_API_KEY') || '',
    apiSecret: properties.getProperty('X_RND_SHOSHA_API_KEY_SECRET') || '',
    accessToken: properties.getProperty('X_RND_SHOSHA_ACCESS_TOKEN') || '',
    accessTokenSecret: properties.getProperty('X_RND_SHOSHA_ACCESS_TOKEN_SECRET') || '',
  };
}

function getEnglishXCredentials(): XCredentials {
  const properties = PropertiesService.getScriptProperties();
  return {
    apiKey: properties.getProperty('X_RND_SHOSHA_EN_API_KEY') || '',
    apiSecret: properties.getProperty('X_RND_SHOSHA_EN_API_KEY_SECRET') || '',
    accessToken: properties.getProperty('X_RND_SHOSHA_EN_ACCESS_TOKEN') || '',
    accessTokenSecret: properties.getProperty('X_RND_SHOSHA_EN_ACCESS_TOKEN_SECRET') || '',
  };
}

function getBlueskyCredentials(): BlueskyCredentials {
  const properties = PropertiesService.getScriptProperties();
  return {
    identifier: properties.getProperty('BSKY_HANDLE') || '',
    password: properties.getProperty('BSKY_RND_SHOSHA_APP_PASS') || '',
  };
}

// ============================================================================
// Main Functions (Called by GAS Triggers)
// ============================================================================

/**
 * Post Japanese sentence to X (Japanese account)
 * Trigger: Daily at JST 5:00 (or as needed)
 */
function postToXJapanese(): void {
  Logger.log('=== Starting Japanese post to X ===');

  try {
    const data = fetchJapaneseSentence();
    const shareContent = generateJapaneseShareContent(data);

    Logger.log(`Post text: ${shareContent.text}`);

    const xCredentials = getJapaneseXCredentials();
    const xResult = postToX(shareContent.text, xCredentials);
    Logger.log(`X post result: ${xResult ? 'Success' : 'Failed'}`);

    Logger.log('=== Japanese post to X completed ===');
  } catch (error) {
    Logger.log(`Japanese post to X error: ${error}`);
  }
}

/**
 * Post English sentence to X (English account)
 * Trigger: Daily at NY time 5:00 (JST 18:00 or 19:00, or as needed)
 */
function postToXEnglish(): void {
  Logger.log('=== Starting English post to X ===');

  try {
    const data = fetchEnglishSentence();
    const shareContent = generateEnglishShareContent(data);

    Logger.log(`Post text: ${shareContent.text}`);

    const xCredentials = getEnglishXCredentials();
    const xResult = postToX(shareContent.text, xCredentials);
    Logger.log(`X post result: ${xResult ? 'Success' : 'Failed'}`);

    Logger.log('=== English post to X completed ===');
  } catch (error) {
    Logger.log(`English post to X error: ${error}`);
  }
}

/**
 * Post Japanese sentence to Bluesky
 * Trigger: Daily at JST 5:00 (or as needed)
 */
function postToBlueskyJapanese(): void {
  Logger.log('=== Starting Japanese post to Bluesky ===');

  try {
    const data = fetchJapaneseSentence();
    const shareContent = generateJapaneseShareContent(data);

    Logger.log(`Post text: ${shareContent.text}`);

    const blueskyCredentials = getBlueskyCredentials();
    const blueskyResult = postToBluesky(
      shareContent.text,
      blueskyCredentials,
      shareContent.url,
      'Random Shosha - 書写のお題',
      '古典文学の一文を書写のお題として'
    );
    Logger.log(`Bluesky post result: ${blueskyResult ? 'Success' : 'Failed'}`);

    Logger.log('=== Japanese post to Bluesky completed ===');
  } catch (error) {
    Logger.log(`Japanese post to Bluesky error: ${error}`);
  }
}

/**
 * Post English sentence to Bluesky
 * Trigger: Daily at NY time 5:00 (JST 18:00 or 19:00, or as needed)
 */
function postToBlueskyEnglish(): void {
  Logger.log('=== Starting English post to Bluesky ===');

  try {
    const data = fetchEnglishSentence();
    const shareContent = generateEnglishShareContent(data);

    Logger.log(`Post text: ${shareContent.text}`);

    const blueskyCredentials = getBlueskyCredentials();
    const blueskyResult = postToBluesky(
      shareContent.text,
      blueskyCredentials,
      shareContent.url,
      'Random Shosha - Calligraphy Practice',
      'Classic literature sentence for calligraphy practice'
    );
    Logger.log(`Bluesky post result: ${blueskyResult ? 'Success' : 'Failed'}`);

    Logger.log('=== English post to Bluesky completed ===');
  } catch (error) {
    Logger.log(`English post to Bluesky error: ${error}`);
  }
}
