import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SettingOutlined, ArrowLeftOutlined, CloseOutlined } from '@ant-design/icons';
import StatusPanel from './components/StatusPanel';

// Suppress native (OS) tooltips: strip `title` attributes (and SVG <title>)
// from whatever the cursor moves onto and its ancestors, before the hover delay
// can pop the Windows tooltip. Installed once for the popover window.
if (typeof document !== 'undefined' && !window.__nativeTooltipsSuppressed) {
  window.__nativeTooltipsSuppressed = true;
  document.addEventListener('pointerover', (event) => {
    let el = event.target;
    while (el && el.nodeType === 1) {
      if (typeof el.hasAttribute === 'function' && el.hasAttribute('title')) el.removeAttribute('title');
      if (el.namespaceURI === 'http://www.w3.org/2000/svg' && typeof el.querySelector === 'function') {
        el.querySelector(':scope > title')?.remove();
      }
      el = el.parentElement;
    }
  }, true);
}
import Settings from './components/Settings';
import { useStatusStore, useSettingsStore } from './store';

// Map live status + connection state → the accent used for the top wash.
export function resolveAccent(connectionState, status) {
  if (connectionState === 'black' || connectionState === 'grey') return 'neutral';
  if (status === 'green') return 'green';
  if (status === 'yellow') return 'amber';
  if (status === 'red') return 'red';
  return 'neutral';
}

export default function App() {
  const [view, setView] = useState('status'); // 'status' | 'settings'
  const [fleetQuery, setFleetQuery] = useState(''); // type-ahead filter for the host pie
  const [revealing, setRevealing] = useState(false);
  const [anchorEdge, setAnchorEdge] = useState('bottom');
  const setStatus = useStatusStore((s) => s.setStatus);
  const setConnectionState = useStatusStore((s) => s.setConnectionState);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const setPopoverMode = useStatusStore((s) => s.setPopoverMode);
  const connectionState = useStatusStore((s) => s.connectionState);
  const status = useStatusStore((s) => s.status);
  const popoverMode = useStatusStore((s) => s.popoverMode);
  const panelRef = useRef(null);

  const accent = resolveAccent(connectionState, status);
  const isExpanded = popoverMode === 'expanded';

  const handlePointerEnter = () => window.electron?.pointerEntered?.();
  const handlePointerLeave = () => window.electron?.pointerLeft?.();
  const pinPopover = () => window.electron?.pinPopover?.();
  const hidePopover = () => window.electron?.hidePopover?.();

  // Windows paints a native OS acrylic backdrop (real blur of the apps behind
  // the popover). DWM rounds the window at its own radius, so square the panel
  // corners to match (no corner leak); the panel keeps the widget-well tint.
  useEffect(() => {
    if (window.electron?.platform === 'win32') document.body.classList.add('win-acrylic');
  }, []);

  // Load initial state from main process
  useEffect(() => {
    window.electron?.getStatus().then(({ status: snap, connectionState: cs }) => {
      if (snap) setStatus(snap);
      setConnectionState(cs);
    });
    window.electron?.getSettings().then((s) => { if (s) setSettings(s); });
  }, []);

  // Subscribe to live pushes and connection state changes
  useEffect(() => {
    window.electron?.onStatus((payload) => setStatus(payload));
    window.electron?.onConnection((state) => setConnectionState(state));
    window.electron?.onPopoverMode((mode) => {
      setPopoverMode(mode);
      if (mode === 'peek') setView('status');
    });
    window.electron?.onAnchorEdge?.((edge) => setAnchorEdge(edge));
  }, []);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    const reportSize = () => {
      window.electron?.resizeContent?.({
        width: Math.ceil(panel.scrollWidth),
        height: Math.ceil(panel.scrollHeight),
      });
    };
    reportSize();
    const observer = new ResizeObserver(reportSize);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [popoverMode, view, status, connectionState]);

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.electron?.rendererReady?.());
    });
  }, []);

  useEffect(() => {
    if (!isExpanded) { setRevealing(false); return undefined; }
    setRevealing(true);
    const fallback = setTimeout(() => setRevealing(false), 240);
    return () => clearTimeout(fallback);
  }, [isExpanded, anchorEdge]);

  // Escape: from Settings → back to status; from status → close the popover.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || !isExpanded) return;
      if (view !== 'status') setView('status');
      else hidePopover();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isExpanded, view]);

  return (
    <div
      ref={panelRef}
      className={`panel ${popoverMode} edge-${anchorEdge}${revealing ? ' revealing' : ''}${isExpanded ? ` view-${view}` : ''}`}
      onPointerEnter={handlePointerEnter}
      onPointerMove={popoverMode === 'peek' ? handlePointerEnter : undefined}
      onPointerLeave={handlePointerLeave}
      onPointerDownCapture={pinPopover}
      onAnimationEnd={() => setRevealing(false)}
      onTransitionEnd={() => setRevealing(false)}
    >
      <div className={`tint ${accent}`} />

      {isExpanded && (
        <header className="topbar">
          {view === 'status' && (
            <input
              className="fleet-search"
              type="text"
              value={fleetQuery}
              onChange={(e) => setFleetQuery(e.target.value)}
              placeholder="Search…"
              aria-label="Search hosts"
              spellCheck={false}
              autoComplete="off"
            />
          )}
          {/* Back button sits in the top-LEFT for the settings submenu. */}
          {view !== 'status' && (
            <button
              className="icon-btn"
              onClick={() => setView('status')}
              title="Back"
              aria-label="Back to status"
            >
              <ArrowLeftOutlined />
            </button>
          )}
          <div className="topbar-spacer" />
          <button
            className={`icon-btn${view === 'settings' ? ' is-active' : ''}`}
            onClick={() => setView(view === 'settings' ? 'status' : 'settings')}
            title="Settings"
            aria-label="Settings"
          >
            <SettingOutlined />
          </button>
          <button className="icon-btn" onClick={hidePopover} title="Close" aria-label="Close">
            <CloseOutlined />
          </button>
        </header>
      )}

      <div className={`panel-scroll ${isExpanded ? 'content-reveal' : ''}`}>
        {!isExpanded || view === 'status'
          ? <StatusPanel mode={popoverMode} fleetQuery={fleetQuery} />
          : <Settings onSaved={() => setView('status')} />}
      </div>
    </div>
  );
}
