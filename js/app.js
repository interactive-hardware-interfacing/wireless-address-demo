'use strict';

/*
 * app.js — wireless-address-demo UI.
 * Send a message to a chosen node (or all), and watch only the addressed
 * node(s) light up — on screen and, with hardware, the real LED blinking.
 * Shows the ACK status for unicast and explains broadcast has no ACK.
 */

import { Bridge } from './bridge.js';
import { SimBridge } from './sim.js';

const $ = s => document.querySelector(s);
const logEl = $('#log');
function log(t) { logEl.textContent += t; if (logEl.textContent.length > 20000) logEl.textContent = logEl.textContent.slice(-15000); logEl.scrollTop = logEl.scrollHeight; }

let bridge = null, simulated = false, target = 'ALL';

// ---- node diagram flashing ----
function flashNode(n) {
  const el = document.getElementById('node' + n);
  if (!el) return;
  el.classList.add('lit');
  setTimeout(() => el.classList.remove('lit'), 600);
}
function flashAll() { [1, 2, 3].forEach(flashNode); }

// ---- line handler ----
function onLine(obj) {
  if (obj.t === 'hello') { log(`[bridge] channel ${obj.channel}, MAC addressing: ${obj.use_mac ? 'on' : 'off (node-id filter)'}${obj.simulated ? ' (sim)' : ''}\n`); return; }
  if (obj.t === 'error') { log(`[bridge error] ${obj.msg}\n`); return; }
  if (obj.t === 'sent') {
    const who = obj.bcast ? 'ALL (broadcast)' : 'Node ' + obj.target;
    const ack = obj.bcast ? 'no ACK (broadcast)' : (obj.ack ? 'ACK ✓' : 'no ACK ✗');
    log(`→ ${who}: "${obj.text}"  [${ack}]\n`);
    $('#ackline').textContent = obj.bcast ? 'Broadcast sent — everyone hears it, nobody acknowledges.' :
      (obj.ack ? `Node ${obj.target} acknowledged.` : `No acknowledgement from Node ${obj.target} (off / out of range?).`);
    $('#ackline').className = obj.bcast ? '' : (obj.ack ? 'ok' : 'bad');
    return;
  }
  if (obj.t === 'rx') {
    // a node reported receiving the message -> light it
    if (obj.node >= 1 && obj.node <= 3) flashNode(obj.node);
    log(`← Node ${obj.node} got it${obj.rssi != null ? ' (RSSI ' + obj.rssi + ')' : ''}\n`);
    return;
  }
}

// ---- send ----
async function doSend() {
  const text = $('#msg').value.trim();
  if (!text) return;
  if (!bridge) { log('[not connected]\n'); return; }
  const cmd = `SEND ${target} ${text}`;
  // optimistic flash so the UI feels responsive; the rx line confirms
  if (target === 'ALL') flashAll(); else flashNode(parseInt(target, 10));
  try { await bridge.send(cmd); } catch (e) { log('[error] ' + e.message + '\n'); }
}

// ---- target picker ----
document.querySelectorAll('.target').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.target').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    target = btn.dataset.target;
    $('#targetlabel').textContent = target === 'ALL' ? 'everyone' : 'Node ' + target;
  });
});

// ---- connect ----
function setStatus(t, c) { $('#status').textContent = t; $('#status').className = c ? 'ok' : ''; $('#connect').disabled = c; $('#sim').disabled = c; $('#disconnect').disabled = !c; $('#send').disabled = !c; }

async function start(useSim) {
  simulated = useSim;
  bridge = useSim ? new SimBridge() : new Bridge();
  bridge.onLine = onLine;
  bridge.onRaw = t => { if (!useSim) log(t); };
  bridge.onClose = e => { log(`\n[closed] ${e?.message || ''}\n`); setStatus('Disconnected', false); bridge = null; };
  try {
    log(useSim ? '[sim] starting\n' : '[serial] requesting port\n');
    await bridge.connect();
    setStatus(useSim ? 'Simulator running' : 'Bridge connected', true);
  } catch (e) { log(`[error] ${e.message}\n`); setStatus(e.message, false); bridge = null; }
}
async function stop() { if (bridge) { try { await bridge.disconnect(); } catch {} } bridge = null; setStatus('Not connected', false); log('[disconnected]\n'); }

$('#connect').addEventListener('click', () => start(false));
$('#sim').addEventListener('click', () => start(true));
$('#disconnect').addEventListener('click', stop);
$('#send').addEventListener('click', doSend);
$('#msg').addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });

if (!navigator.serial) $('#nowebserial').hidden = false;
setStatus('Not connected', false);
log('Ready. "Try without hardware" for the simulator, or "Connect bridge".\n');
