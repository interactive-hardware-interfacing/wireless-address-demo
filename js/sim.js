'use strict';

/*
 * sim.js — fake bridge for wireless-address-demo. Accepts the same SEND
 * command the real bridge does and replies with a `sent` line (ack true for a
 * specific node, bcast for ALL), plus a short `rx` echo from the targeted
 * node(s), so the page's node diagram lights up offline too.
 */

export class SimBridge {
  constructor() { this.onLine = () => {}; this.onRaw = () => {}; this.onClose = () => {}; this.connected = false; }

  async connect() {
    this.connected = true;
    this._emit({ t: 'hello', role: 'bridge', proto: 1, channel: 6, use_mac: false, simulated: true });
    return true;
  }
  _emit(o) { this.onRaw(JSON.stringify(o) + '\n'); this.onLine(o); }

  async send(text) {
    const line = text.trim();
    const m = /^SEND\s+(\S+)\s+(.*)$/i.exec(line);
    if (!m) { this._emit({ t: 'error', msg: 'unknown command' }); return; }
    const tgt = m[1].toUpperCase(), msg = m[2];
    const ms = Date.now() & 0xffffffff;
    const bcast = tgt === 'ALL';
    const targetId = bcast ? 0 : parseInt(tgt, 10);
    if (!bcast && ![1, 2, 3].includes(targetId)) { this._emit({ t: 'error', msg: 'bad target' }); return; }
    // sent confirmation (ack only for a specific node)
    setTimeout(() => this._emit({ t: 'sent', target: tgt, text: msg, ack: !bcast, bcast, ms }), 40);
    // node echo(es): the addressed node, or all three on broadcast
    const nodes = bcast ? [1, 2, 3] : [targetId];
    nodes.forEach((n, i) => setTimeout(() =>
      this._emit({ t: 'rx', from: '7c9ebda1' + ('0' + n).slice(-2) + '00', node: n, text: '', rssi: -38 - n * 3, ms: ms + 2 }),
      70 + i * 30));
  }

  async disconnect() { this.connected = false; }
}
