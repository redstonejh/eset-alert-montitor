import React, { useEffect, useState } from 'react';
import { useSettingsStore } from '../store';

const REGIONS = [
  { value: 'us', label: 'United States' },
  { value: 'eu', label: 'Europe' },
  { value: 'de', label: 'Germany' },
  { value: 'ca', label: 'Canada' },
];

export default function Settings({ onSaved }) {
  const store = useSettingsStore();
  const setStoreSettings = useSettingsStore((s) => s.setSettings);

  const [busy, setBusy] = useState(''); // '' | 'save'
  const [done, setDone] = useState(''); // '' | 'save'  (brief success state)
  const [error, setError] = useState('');

  const [fields, setFields] = useState({
    esetRegion: 'us', esetUsername: '', esetPassword: '',
    pollIntervalSec: 60, lookbackHours: 24, esetBaseUrl: '', esetAuthUrl: '',
  });

  // Keep the fields in sync with whatever the store currently holds.
  useEffect(() => {
    setFields({
      esetRegion: store.esetRegion || 'us',
      esetUsername: store.esetUsername || '',
      esetPassword: store.esetPassword || '',
      pollIntervalSec: store.pollIntervalSec || 60,
      lookbackHours: store.lookbackHours || 24,
      esetBaseUrl: store.esetBaseUrl || '',
      esetAuthUrl: store.esetAuthUrl || '',
    });
  }, [store.esetRegion, store.esetUsername, store.esetPassword, store.pollIntervalSec,
    store.lookbackHours, store.esetBaseUrl, store.esetAuthUrl]);

  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));

  // Expanding "Advanced" grows the panel; report the new content height so the
  // popover window resizes to reveal the fields (the ResizeObserver can miss the
  // flex-constrained growth, so we report it explicitly on toggle).
  const reportPanelSize = () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const panel = document.querySelector('.panel');
      if (panel) {
        window.electron?.resizeContent?.({
          width: Math.ceil(panel.scrollWidth),
          height: Math.ceil(panel.scrollHeight),
        });
      }
    }));
  };

  async function save() {
    setBusy('save');
    setError('');
    try {
      const payload = {
        esetRegion: fields.esetRegion,
        esetUsername: fields.esetUsername.trim(),
        esetPassword: fields.esetPassword,
        pollIntervalSec: Number(fields.pollIntervalSec) || 60,
        lookbackHours: Number(fields.lookbackHours) || 24,
        esetBaseUrl: fields.esetBaseUrl.trim(),
        esetAuthUrl: fields.esetAuthUrl.trim(),
      };
      const result = await window.electron.saveSettings(payload);
      if (result?.ok) {
        setStoreSettings(payload);
        setDone('save');
        setTimeout(() => onSaved?.(), 900);
      } else {
        setError(result?.error || 'Could not save');
      }
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="settings">
      <div className="settings-lead">
        Enter your ESET Connect API user to pull detections from ESET PROTECT.
      </div>

      <div className="settings-grid">
        <label className="settings-field">
          <span className="settings-label">Region</span>
          <select className="field" value={fields.esetRegion} onChange={set('esetRegion')}>
            {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label className="settings-field">
          <span className="settings-label">Poll (sec)</span>
          <input className="field" type="number" value={fields.pollIntervalSec} onChange={set('pollIntervalSec')} />
        </label>
        <label className="settings-field full">
          <span className="settings-label">API user</span>
          <input className="field" placeholder="api-user@tenant" value={fields.esetUsername} onChange={set('esetUsername')} />
        </label>
        <label className="settings-field full">
          <span className="settings-label">API password</span>
          <input className="field" type="password" placeholder="••••••••" value={fields.esetPassword} onChange={set('esetPassword')} />
        </label>
      </div>

      {error && <div className="settings-error">{error}</div>}

      <div className="settings-divider" />

      <details className="settings-advanced" onToggle={reportPanelSize}>
        <summary>Advanced</summary>
        <div className="settings-grid">
          <label className="settings-field">
            <span className="settings-label">Lookback (hrs)</span>
            <input className="field" type="number" value={fields.lookbackHours} onChange={set('lookbackHours')} />
          </label>
          <label className="settings-field full">
            <span className="settings-label">Detections URL override</span>
            <input className="field mono" placeholder="https://us.incident-management.eset.systems" value={fields.esetBaseUrl} onChange={set('esetBaseUrl')} />
          </label>
          <label className="settings-field full">
            <span className="settings-label">OAuth token URL override</span>
            <input className="field mono" placeholder="https://…/oauth/token" value={fields.esetAuthUrl} onChange={set('esetAuthUrl')} />
          </label>
        </div>
      </details>

      <button className="btn-primary" onClick={save} disabled={!!busy || !!done}>
        {done === 'save' ? '✓ Connected' : busy === 'save' ? 'Connecting…' : 'Save & Connect'}
      </button>
    </div>
  );
}
