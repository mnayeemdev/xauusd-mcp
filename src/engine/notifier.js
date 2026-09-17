/**
 * Notification abstraction for the XAUUSD auto signal watcher.
 *
 * V1 channels: console (always on) and an optional best-effort Windows
 * toast notification via a short spawned PowerShell script -- no new npm
 * dependency. Telegram/WhatsApp/email/SMS/broker execution are explicitly
 * out of scope for this task and are not implemented here.
 *
 * This module renders and delivers an already-validated alert payload. It
 * never computes, repairs, or infers trade geometry -- every field it
 * prints comes straight from the caller (src/engine/watcher.js), which in
 * turn only calls notify() after validating the authoritative MCP engine
 * result.
 */
import { spawn } from 'node:child_process';

function fmtNum(v) {
  return v === null || v === undefined ? 'NA' : String(v);
}

/** Exact alert format required by the watcher spec. */
export function formatSignalAlert(alert) {
  return [
    'XAUUSD SIGNAL',
    '',
    `Action: ${fmtNum(alert.action)}`,
    `Entry: ${fmtNum(alert.entry)}`,
    `SL: ${fmtNum(alert.sl)}`,
    `TP1: ${fmtNum(alert.tp1)}`,
    `TP2: ${fmtNum(alert.tp2)}`,
    `RR: ${fmtNum(alert.rr)}`,
    `Quality: ${fmtNum(alert.quality)}`,
    `TF: ${fmtNum(alert.timeframe)}`,
    `Setup: ${fmtNum(alert.setup)}`,
    `Time: ${fmtNum(alert.time)}`,
  ].join('\n');
}

function consoleNotify(alert, { log = (msg) => console.log(msg) } = {}) {
  log(formatSignalAlert(alert));
}

// Best-effort Windows toast via powershell.exe + the built-in WinRT toast
// APIs (no BurntToast/npm dependency). Never throws, never blocks the
// watcher loop, and is a no-op on non-Windows platforms.
function windowsDesktopNotify(alert, { spawnImpl = spawn } = {}) {
  if (process.platform !== 'win32') return;
  try {
    const title = `XAUUSD ${fmtNum(alert.action)} SIGNAL`;
    const body = `Entry ${fmtNum(alert.entry)} | SL ${fmtNum(alert.sl)} | TP1 ${fmtNum(alert.tp1)} | RR ${fmtNum(alert.rr)}`;
    const escape = (s) => String(s).replace(/'/g, "''");
    const script = [
      "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null",
      "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] > $null",
      "$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)",
      "$textNodes = $template.GetElementsByTagName('text')",
      `$textNodes.Item(0).AppendChild($template.CreateTextNode('${escape(title)}')) > $null`,
      `$textNodes.Item(1).AppendChild($template.CreateTextNode('${escape(body)}')) > $null`,
      "$toast = [Windows.UI.Notifications.ToastNotification]::new($template)",
      "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('XAUUSD MCP Watcher').Show($toast)",
    ].join('\n');
    const child = spawnImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], { stdio: 'ignore', detached: true });
    child.on('error', () => { /* best-effort -- e.g. powershell.exe not on PATH */ });
    child.unref();
  } catch { /* best-effort -- desktop notification is never load-bearing */ }
}

/**
 * channels: subset of ['console', 'desktop']. console is required by the
 * spec and should not normally be omitted; desktop is best-effort and
 * silently skipped on non-Windows or on any failure.
 */
export function notify(alert, { channels = ['console', 'desktop'], _deps } = {}) {
  if (channels.includes('console')) consoleNotify(alert, _deps);
  if (channels.includes('desktop')) windowsDesktopNotify(alert, _deps);
}
