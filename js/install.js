'use strict';

/*
 * install.js — the Firmware tab: put the bridge or node code.py on a XIAO ESP32-C3
 * from the browser, and (for a bare board) put CircuitPython on it first.
 * The three nodes run one file; the page sets MY_ID in the text before writing
 * it, so there is nothing to edit by hand and nothing to jumper.
 *
 * The C3 has no CIRCUITPY drive, so "copy code.py to the board" means talking
 * to CircuitPython's raw REPL over Web Serial (js/device/). The write is
 * verified by size and CRC32 on the board, then the board is soft-rebooted and
 * we watch for the firmware's {"t":"hello"} line to prove it is running.
 *
 * Installing CircuitPython itself goes through flasher/ (esptool-js, loaded
 * only when that button is used). circuitpython.org does not allow a page to
 * fetch the .bin directly, so that path is: download it, pick the file here.
 */

import { SerialLink, hasWebSerial } from './device/serial-link.js';
import { ReplDevice } from './device/repl-device.js';

// role → { path, patch(text), until } ; roles are "bridge", "node1", "node2", "node3"
const ROLES = {
  bridge: { path: 'firmware/bridge/code.py', label: 'bridge', until: /\{"t":"hello"/ },
};
for (const n of [1, 2, 3]) ROLES['node' + n] = {
  path: 'firmware/node/code.py', label: `node ${n}`, id: n,
  patch: t => { const out = t.replace(/^MY_ID\s*=\s*\d+/m, `MY_ID = ${n}`); if (!/^MY_ID = \d+/m.test(out)) throw new Error('could not find the MY_ID line in firmware/node/code.py'); return out; },
  until: /^node \d+ listening/m,
};
const EXPECT_BOARD = /xiao_esp32c3/i;

/**
 * @param {object} ui   { installButtons: {role: button}, status, bar, log, noRepl, cpFile, cpLoad, cpName, cpFlash }
 * @param {object} opts { releaseSerial: () => Promise<void> }   closes the instrument's own port first
 */
export function initInstall(ui, { releaseSerial = async () => {} } = {}) {
  const log = (t, cls = '') => {
    if (!t) return;
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = t.replace(/\s+$/, '');
    ui.log.appendChild(line);
    while (ui.log.childElementCount > 400) ui.log.firstChild.remove();
    ui.log.scrollTop = ui.log.scrollHeight;
  };
  const phase = (t, cls = '') => { ui.status.textContent = t; ui.status.className = 'fwstatus ' + cls; log('— ' + t, 'dim'); };
  const progress = f => { ui.bar.hidden = f == null; if (f != null) ui.bar.value = Math.max(0, Math.min(1, f)); };
  let busy = false;
  const setBusy = b => { busy = b; for (const el of Object.values(ui.installButtons)) el.disabled = b; ui.cpFlash.disabled = b || !image; ui.cpLoad.disabled = b; };

  if (!hasWebSerial()) {
    phase('This browser has no Web Serial. Use Chrome or Edge on a laptop or desktop to install firmware.', 'warn');
    for (const el of Object.values(ui.installButtons)) el.disabled = true;
    ui.cpLoad.disabled = ui.cpFlash.disabled = true;
    return;
  }

  // ---- 1. code.py over the REPL --------------------------------------------
  async function install(role) {
    if (busy) return;
    const R = ROLES[role];
    const path = R.path;
    setBusy(true); progress(null); ui.noRepl.hidden = true;
    let link = null, dev = null;
    try {
      await releaseSerial();
      phase(`fetching ${path}`);
      const r = await fetch(path, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`could not fetch ${path} (${r.status})`);
      let text = await r.text();
      if (R.patch) { text = R.patch(text); log(`set MY_ID = ${R.id}`, 'ok'); }
      log(`${path}: ${text.length} bytes`);

      phase('choose the board\'s port in the chooser');
      link = new SerialLink();
      link.onDrop = e => log('port dropped: ' + (e?.message || e), 'warn');
      await link.open(115200);
      log('port open (' + link.info() + ')');
      dev = new ReplDevice(link, log);

      phase('looking for CircuitPython on the board…');
      let id;
      try { id = await dev.connect(); }
      catch (e) {
        log(e.message, 'warn');
        phase('No CircuitPython answered. If this is a bare board, install CircuitPython first (below), then try again.', 'warn');
        ui.noRepl.hidden = false;
        return;
      }
      log(`board ${id.boardId} · CircuitPython ${id.cpVersion} · uid ${id.uid}`, 'ok');
      if (!EXPECT_BOARD.test(id.boardId)) log(`note: this firmware is written for the XIAO ESP32-C3; the board reports "${id.boardId}". Pins may differ.`, 'warn');

      phase(`writing code.py (${R.label})…`);
      progress(0);
      await dev.writeText('code.py', text, progress);
      progress(null);

      phase('rebooting the board and watching its first lines…');
      const boot = await dev.reboot({ until: R.until });
      if (role === 'bridge') {
        const hello = /\{"t":"hello"[^\n]*/.exec(boot);
        if (hello) {
          phase('Done. This board is the bridge. Leave it plugged in, go back to the instrument and click Connect bridge.', 'ok');
        } else {
          phase('code.py written and verified, but no hello line was seen within 15 s. Check the boot output above for a Python error.', 'warn');
        }
      } else {
        const listening = /^node (\d+) listening/m.exec(boot);
        const mac = /^NODE \d+ MAC: ([0-9a-f:]+)/m.exec(boot);
        if (mac) log(`node ${R.id} MAC ${mac[1]} — for NODE_MACS in the bridge firmware if you turn USE_MAC on`, 'ok');
        if (listening && parseInt(listening[1], 10) === R.id) {
          phase(`Done. This board is node ${R.id}. Label it, move it to a USB bank, and do the next one.`, 'ok');
        } else if (listening) {
          phase(`The board came up as node ${listening[1]}, not ${R.id} — the MY_ID patch did not take. Try again.`, 'warn');
        } else {
          phase('code.py written and verified, but the node did not report "listening" within 15 s. Check the boot output above for a Python error.', 'warn');
        }
      }
    } catch (e) {
      log(e.message || String(e), 'warn');
      phase('Install failed: ' + (e.message || e), 'warn');
    } finally {
      try { await dev?.close(); } catch {}
      if (!dev) { try { await link?.close(); } catch {} }
      progress(null);
      setBusy(false);
    }
  }
  for (const [role, el] of Object.entries(ui.installButtons)) el.addEventListener('click', () => install(role));

  // ---- 2. CircuitPython itself, for a bare board -------------------------------
  let flasher = null, image = null;
  ui.cpLoad.addEventListener('click', () => ui.cpFile.click());
  ui.cpFile.addEventListener('change', async () => {
    const f = ui.cpFile.files?.[0];
    if (!f) return;
    try {
      flasher ??= await import('../flasher/flasher.js');
      const bytes = new Uint8Array(await f.arrayBuffer());
      flasher.setImage(f.name, bytes);
      image = flasher.image;
      const info = image.info;
      ui.cpName.textContent = `${f.name} · ${(bytes.length / 1024).toFixed(0)} kB` + (info ? ` · CircuitPython ${info.version} for ${info.boardId}` : '');
      if (info && !EXPECT_BOARD.test(info.boardId)) log(`note: that image is for "${info.boardId}", not the XIAO ESP32-C3.`, 'warn');
      if (!info) log('note: the file name is not the usual adafruit-circuitpython-<board>-<lang>-<version>.bin shape; make sure it is the .bin (not .uf2) for the XIAO ESP32-C3.', 'warn');
      ui.cpFlash.disabled = busy;
    } catch (e) { log('could not load the image: ' + (e.message || e), 'warn'); }
  });
  ui.cpFlash.addEventListener('click', async () => {
    if (busy || !image?.bytes) return;
    setBusy(true); progress(null);
    try {
      await releaseSerial();
      flasher ??= await import('../flasher/flasher.js');
      const facts = await flasher.flash({
        offset: 0x0, eraseAll: true, baud: 460800, expectChip: 'esp32c3',
        onPhase: t => phase(t), onProgress: f => progress(f), onLog: t => log(t, 'dim'),
      });
      progress(null);
      phase(`CircuitPython flashed (${facts.chip}, ${facts.seconds}s). Unplug and replug the board, then click Install firmware.`, 'ok');
    } catch (e) {
      const m = e.message || String(e);
      log(m, 'warn');
      if (/Failed to connect|timeout/i.test(m)) log('The chip did not answer. Unplug the board, hold its BOOT button (B) while plugging it back in, release, and try again.', 'warn');
      phase('Flash failed: ' + m, 'warn');
    } finally { progress(null); setBusy(false); }
  });
}
