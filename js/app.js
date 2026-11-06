'use strict';

/*
 * app.js — wireless-address-demo UI.
 * Send a message to a chosen node (or all), and watch only the addressed
 * node(s) light up — on screen and, with hardware, the real LED blinking.
 * Shows the ACK status for unicast and explains broadcast has no ACK.
 */

import { Bridge } from './bridge.js';
import { SimBridge } from './sim.js';
import { initViews } from './views.js';
import { initInstall } from './install.js';

const $ = s => document.querySelector(s);
const logEl = $('#log');
function log(t) { logEl.textContent += t; if (logEl.textContent.length > 20000) logEl.textContent = logEl.textContent.slice(-15000); logEl.scrollTop = logEl.scrollHeight; }

let bridge = null, simulated = false, target = 'ALL', lastBcast = false;

// ---- node diagram flashing ----
const flashTimers = {};
function flashNode(n) {
  const el = document.getElementById('node' + n);
  if (!el) return;
  el.classList.add('lit');
  clearTimeout(flashTimers[n]);
  flashTimers[n] = setTimeout(() => el.classList.remove('lit'), 600);
}
function unlightAll() { [1, 2, 3].forEach(n => { clearTimeout(flashTimers[n]); document.getElementById('node' + n)?.classList.remove('lit'); }); }
function flashAll() { [1, 2, 3].forEach(flashNode); }

// ---- line handler ----
function onLine(obj) {
  if (obj.t === 'hello') { log(`[bridge] channel ${obj.channel}, MAC addressing: ${obj.use_mac ? 'on' : 'off (node-id filter)'}${obj.simulated ? ' (sim)' : ''}\n`); return; }
  if (obj.t === 'error') { log(`[bridge error] ${obj.msg}\n`); return; }
  if (obj.t === 'sent') {
    const who = obj.bcast ? 'ALL (broadcast)' : 'Node ' + obj.target;
    // ack: true/false = a real MAC unicast was / wasn't acknowledged by the radio;
    // null = sent as an id-filtered broadcast (the default), so no radio ACK exists.
    const ack = obj.bcast ? 'no ACK (broadcast)' : obj.ack == null ? 'sent, id-filtered' : (obj.ack ? 'ACK ✓' : 'no ACK ✗');
    log(`→ ${who}: "${obj.text}"  [${ack}]\n`);
    const a = $('#ackline');
    lastBcast = !!obj.bcast;
    if (obj.bcast) { a.textContent = 'Broadcast sent — everyone hears it, nobody acknowledges.'; a.className = ''; }
    else if (obj.ack == null) { a.textContent = `Sent to Node ${obj.target}. Every node hears it; only Node ${obj.target} should answer…`; a.className = ''; }
    else if (obj.ack) { a.textContent = `Node ${obj.target} acknowledged at the radio level.`; a.className = 'ok'; }
    else { a.textContent = `No acknowledgement from Node ${obj.target} (off / out of range?).`; a.className = 'bad'; }
    return;
  }
  if (obj.t === 'rx') {
    // a node reported receiving the message -> light it
    if (obj.node >= 1 && obj.node <= 3) flashNode(obj.node);
    log(`← Node ${obj.node} got it${obj.rssi != null ? ' (RSSI ' + obj.rssi + ')' : ''}\n`);
    const a = $('#ackline');
    if (!lastBcast && a.className !== 'bad' && obj.node >= 1 && obj.node <= 3) { a.textContent = `Node ${obj.node} got it.`; a.className = 'ok'; }
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
function setStatus(t, c) { $('#status').textContent = t; $('#status').className = c ? 'ok' : ''; $('#connect').disabled = c; $('#sim').disabled = c; $('#disconnect').disabled = !c; $('#send').disabled = !c; $('#logsend').disabled = !c; $('#logcmd').disabled = !c; }

async function start(useSim) {
  simulated = useSim;
  bridge = useSim ? new SimBridge() : new Bridge();
  bridge.onLine = onLine;
  bridge.onRaw = t => { if (!useSim) log(t); };
  bridge.onClose = e => { unlightAll(); log(`\n[closed] ${e?.message || ''}\n`); setStatus('Disconnected', false); bridge = null; };
  try {
    log(useSim ? '[sim] starting\n' : '[serial] requesting port\n');
    await bridge.connect();
    setStatus(useSim ? 'Simulator running' : 'Bridge connected', true);
  } catch (e) { log(`[error] ${e.message}\n`); setStatus(e.message, false); bridge = null; }
}
async function stop() { unlightAll(); if (bridge) { try { await bridge.disconnect(); } catch {} } bridge = null; setStatus('Not connected', false); $('#ackline').textContent = ''; $('#ackline').className = ''; log('[disconnected]\n'); }

// raw command line in the terminal (the buttons build the same SEND command)
async function sendRaw() {
  const cmd = $('#logcmd').value.trim();
  if (!cmd || !bridge) return;
  $('#logcmd').value = '';
  log(`> ${cmd}\n`);
  try { await bridge.send(cmd); } catch (e) { log('[error] ' + e.message + '\n'); }
}
$('#logsend').addEventListener('click', sendRaw);
$('#logcmd').addEventListener('keydown', e => { if (e.key === 'Enter') sendRaw(); });

// ---- doc views + firmware install ----
const views = initViews(
  $('#instrument'),
  { hardware: $('#hardware'), firmware: $('#firmware'), about: $('#about') },
  [...document.querySelectorAll('nav a[data-view]')],
);
initInstall({
  installButtons: { bridge: $('#fwInstallBridge'), node1: $('#fwInstallNode1'), node2: $('#fwInstallNode2'), node3: $('#fwInstallNode3') },
  status: $('#fwStatus'), bar: $('#fwBar'), log: $('#fwLog'), noRepl: $('#fwNoRepl'),
  cpFile: $('#cpFile'), cpLoad: $('#cpLoad'), cpName: $('#cpName'), cpFlash: $('#cpFlash'),
}, { releaseSerial: async () => { if (bridge && !simulated) await stop(); } });

$('#connect').addEventListener('click', () => start(false));
$('#sim').addEventListener('click', () => start(true));
$('#disconnect').addEventListener('click', stop);
$('#send').addEventListener('click', doSend);
$('#msg').addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });

if (!navigator.serial) $('#nowebserial').hidden = false;
setStatus('Not connected', false);
log('Ready. "Try without hardware" for the simulator, or "Connect bridge".\n');
