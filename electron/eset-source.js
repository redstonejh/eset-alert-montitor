// ESET Connect data source — the replacement for the MQTT transport. It does ONE
// job: authenticate to the ESET Connect cloud API and return the current list of
// detections (GET /v2/detections). The main process maps each detection onto the
// exact same "check" payload the MQTT message handler produced and feeds it into
// the unchanged ingest pipeline, so nothing downstream of the data source changes.
//
// Auth: an ESET Connect "API User" (created in ESET Business Account / ESET
// PROTECT Hub) authenticates against the ESET Identity Provider for a short-lived
// JWT bearer token. Region selects the API host. The token endpoint is
// overridable (settings.esetAuthUrl) in case ESET adjusts it for a tenant.

const INCIDENT_HOSTS = {
  eu: 'https://eu.incident-management.eset.systems',
  de: 'https://de.incident-management.eset.systems',
  us: 'https://us.incident-management.eset.systems',
  ca: 'https://ca.incident-management.eset.systems',
};

const IAM_HOSTS = {
  eu: 'https://eu.business-account.iam.eset.systems',
  de: 'https://de.business-account.iam.eset.systems',
  us: 'https://us.business-account.iam.eset.systems',
  ca: 'https://ca.business-account.iam.eset.systems',
};

const TOKEN_SKEW_MS = 5 * 60 * 1000; // refresh 5 min before the ~60-min expiry

let token = null;
let tokenExpiresAt = 0;

function regionHosts(settings) {
  const region = (settings.esetRegion || 'us').toLowerCase();
  return {
    base: settings.esetBaseUrl || INCIDENT_HOSTS[region] || INCIDENT_HOSTS.us,
    authUrl: settings.esetAuthUrl || `${IAM_HOSTS[region] || IAM_HOSTS.us}/oauth/token`,
  };
}

async function ensureToken(settings) {
  if (token && Date.now() < tokenExpiresAt - TOKEN_SKEW_MS) return token;
  if (!settings.esetUsername || !settings.esetPassword) {
    throw new Error('ESET API credentials are not configured');
  }
  const { authUrl } = regionHosts(settings);
  const body = new URLSearchParams({
    grant_type: 'password',
    username: settings.esetUsername,
    password: settings.esetPassword,
  });
  const res = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ESET auth failed: HTTP ${res.status} ${text.slice(0, 160)}`);
  }
  const json = await res.json();
  token = json.access_token || json.token;
  if (!token) throw new Error('ESET auth response missing access_token');
  tokenExpiresAt = Date.now() + (Number(json.expires_in) || 3600) * 1000;
  return token;
}

async function getPage(settings, params, attempt = 0) {
  const { base } = regionHosts(settings);
  const jwt = await ensureToken(settings);
  const res = await fetch(`${base}/v2/detections?${params.toString()}`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
  });
  // 202: result is being prepared — re-request via the response-id until ready.
  if (res.status === 202 && attempt < 8) {
    const id = res.headers.get('response-id') || res.headers.get('Response-Id');
    await new Promise((r) => setTimeout(r, 1000 + attempt * 500));
    const next = new URLSearchParams(params);
    if (id) next.set('responseId', id);
    return getPage(settings, next, attempt + 1);
  }
  if (res.status === 401 && attempt < 1) {
    token = null; // force re-auth once
    return getPage(settings, params, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ESET detections HTTP ${res.status}: ${text.slice(0, 160)}`);
  }
  return res.json();
}

// Return every detection in [startTime, endTime], following pagination.
export async function fetchDetections(settings, startTime, endTime) {
  const out = [];
  let pageToken;
  do {
    const params = new URLSearchParams();
    if (startTime) params.set('startTime', startTime);
    if (endTime) params.set('endTime', endTime);
    params.set('pageSize', '1000');
    if (pageToken) params.set('pageToken', pageToken);
    const json = await getPage(settings, params);
    const detections = json.detections || json.items || json.data || [];
    if (Array.isArray(detections)) out.push(...detections);
    pageToken = json.nextPageToken || json.next_page_token || '';
  } while (pageToken);
  return out;
}
