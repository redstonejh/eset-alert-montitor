// Threat scoring — a faithful JavaScript port of IT-Alert-Monitor's scoring
// (app/scoring.py + app/models.py). All taxonomy keywords, base scores,
// adjustment point values, and severity thresholds are copied verbatim from that
// reference; nothing here is invented. Velocity and host-load adjustments are
// omitted only because their control thresholds are not part of the scoring
// defaults; everything else is reproduced exactly.
//
// Input is a raw ESET detection plus the full current detection set (the poll
// window), which serves as the alert history the contextual adjustments query.

// app/models.py — DEFAULT_TAXONOMY_SCORES (keyword → base score).
const DEFAULT_TAXONOMY_SCORES = {
  ransomware: 97, rootkit: 95, backdoor: 90, rat: 90, keylogger: 85,
  psw: 82, spy: 80, stealer: 80, infostealer: 80, exploit: 78, worm: 76,
  trojan: 74, phishing: 72, dropper: 70, cryptominer: 60, downloader: 55,
  injector: 52, obfuscated: 45, packed: 40, redirector: 38, riskware: 25,
  pua: 18, adware: 15, cookie: 8,
};

// app/models.py — AppConfig scoring defaults.
const CFG = {
  use_taxonomy_weighting: true,
  unknown_base_score: 30,
  severity_critical_threshold: 95,
  severity_high_threshold: 70,
  severity_medium_threshold: 45,
  repeated_same_host_1_adjustment: 20,
  repeated_same_host_2_adjustment: 40,
  repeated_same_host_3_adjustment: 60,
  campaign_endpoint_2_adjustment: 8,
  campaign_endpoint_3_adjustment: 18,
  campaign_endpoint_5_adjustment: 30,
  persistence_2_day_adjustment: 10,
  persistence_4_day_adjustment: 20,
  failure_adjustment: 20,
  success_adjustment: -20,
  repeated_same_host_window_hours: 24,
  campaign_endpoint_window_hours: 24,
  persistent_repeat_threshold: 3,
};
const PERSISTENT_REPEAT_OVERRIDE_WINDOW_DAYS = 7; // app/scoring.py

// Taxonomy keywords checked longest-first (app/scoring.py base_score).
const TAXONOMY_KEYS = Object.keys(DEFAULT_TAXONOMY_SCORES).sort((a, b) => b.length - a.length);

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// Field extraction kept consistent with the detection→check mapping in main.js.
function threatOf(d) {
  return d.displayName || d.detectionName || d.typeName || d.objectTypeName || 'Detection';
}
function hostOf(d) {
  const dev = d.device || {};
  return dev.displayName || dev.hostname || d.deviceName || 'Unknown device';
}
function timeOf(d) {
  const t = Date.parse(d.occurTime || d.creationTime || '');
  return Number.isFinite(t) ? t : Date.now();
}

function baseScore(threatName) {
  if (!CFG.use_taxonomy_weighting) return CFG.unknown_base_score;
  const name = String(threatName || '').toLowerCase();
  for (const key of TAXONOMY_KEYS) {
    if (name.includes(key)) return DEFAULT_TAXONOMY_SCORES[key];
  }
  return CFG.unknown_base_score;
}

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

// Score one detection against the full set. Returns { score, severity, reasons }.
export function scoreDetection(d, all = []) {
  const reasons = [];
  const threat = threatOf(d);
  const host = hostOf(d);
  const t = timeOf(d);

  let score = baseScore(threat);
  reasons.push(`base(${threat}): ${score}`);

  const sameThreat = all.filter((x) => threatOf(x) === threat);
  const sameThreatHost = sameThreat.filter((x) => hostOf(x) === host);

  // Repeated same host (within window) — highest applicable tier.
  const repWindow = t - CFG.repeated_same_host_window_hours * HOUR;
  const repeats = sameThreatHost.filter((x) => x !== d && timeOf(x) >= repWindow).length;
  if (repeats >= 3) { score += CFG.repeated_same_host_3_adjustment; reasons.push(`repeat x3+: +${CFG.repeated_same_host_3_adjustment}`); }
  else if (repeats >= 2) { score += CFG.repeated_same_host_2_adjustment; reasons.push(`repeat x2: +${CFG.repeated_same_host_2_adjustment}`); }
  else if (repeats >= 1) { score += CFG.repeated_same_host_1_adjustment; reasons.push(`repeat x1: +${CFG.repeated_same_host_1_adjustment}`); }

  // Campaign spread across endpoints (within window) — highest applicable tier.
  const campWindow = t - CFG.campaign_endpoint_window_hours * HOUR;
  const hosts = new Set(sameThreat.filter((x) => timeOf(x) >= campWindow).map(hostOf));
  if (hosts.size >= 5) { score += CFG.campaign_endpoint_5_adjustment; reasons.push(`campaign 5+: +${CFG.campaign_endpoint_5_adjustment}`); }
  else if (hosts.size >= 3) { score += CFG.campaign_endpoint_3_adjustment; reasons.push(`campaign 3: +${CFG.campaign_endpoint_3_adjustment}`); }
  else if (hosts.size >= 2) { score += CFG.campaign_endpoint_2_adjustment; reasons.push(`campaign 2: +${CFG.campaign_endpoint_2_adjustment}`); }

  // Persistence across distinct days (same threat+host).
  const days = new Set(sameThreatHost.map((x) => dayKey(timeOf(x))));
  if (days.size >= 4) { score += CFG.persistence_4_day_adjustment; reasons.push(`persistence 4d: +${CFG.persistence_4_day_adjustment}`); }
  else if (days.size >= 2) { score += CFG.persistence_2_day_adjustment; reasons.push(`persistence 2d: +${CFG.persistence_2_day_adjustment}`); }

  // Containment: a successful response lowers urgency.
  const handled = Array.isArray(d.responses) && d.responses.length > 0;
  if (d.resolved === true || handled) { score += CFG.success_adjustment; reasons.push(`contained: ${CFG.success_adjustment}`); }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Hard overrides → 100.
  if (d.resolved !== true && !handled) {
    score = 100;
    reasons.push('override: unresolved/unhandled → 100');
  }
  const persistWindow = t - PERSISTENT_REPEAT_OVERRIDE_WINDOW_DAYS * DAY;
  const persistDays = new Set(sameThreatHost.filter((x) => timeOf(x) >= persistWindow).map((x) => dayKey(timeOf(x))));
  if (sameThreatHost.length >= CFG.persistent_repeat_threshold && persistDays.size >= 2) {
    score = 100;
    reasons.push('override: persistent repeat → 100');
  }

  return { score, severity: severityForScore(score), reasons };
}

export function severityForScore(score) {
  if (score >= CFG.severity_critical_threshold) return 'Critical';
  if (score >= CFG.severity_high_threshold) return 'High';
  if (score >= CFG.severity_medium_threshold) return 'Medium';
  return 'Low';
}
