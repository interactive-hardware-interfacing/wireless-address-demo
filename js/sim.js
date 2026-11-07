'use strict';

/*
 * sim.js — fake bridge for wireless-address-demo. Accepts the same SEND and
 * MODE commands the real bridge does. In id mode every node "hears" every
 * packet: the addressed one answers `rx`, the others `heard`. In MAC mode a
 * single-node send reaches only that node (real ACK, nobody else hears it);
 * a broadcast still reaches everyone.
 */

export class SimBridge {
  constructor() { this.onLine = () => {}; this.onRaw = () => {}; this.onClose = () => {}; this.connected = false; this.useMac = false; }

  async connect() {
    this.connected = true;
    this._emit({ t: 'hello', role: 'bridge', proto: 1, channel: 6, use_mac: false, simulated: true });
    return true;
  }
  _emit(o) { this.onRaw(JSON.stringify(o) + '\n'); this.onLine(o); }

  async send(text) {
    const line = text.trim();
    const mode = /^MODE\s+(ID|MAC)$/i.exec(line);
    if (mode) { this.useMac = mode[1].toUpperCase() === 'MAC'; setTimeout(() => this._emit({ t: 'mode', use_mac: this.useMac, known: [1, 2, 3] }), 30); return; }
    const m = /^SEND\s+(\S+)\s+(.*)$/i.exec(line);
    if (!m) { this._emit({ t: 'error', msg: 'unknown command' }); return; }
    const tgt = m[1].toUpperCase(), msg = m[2];
    const ms = Date.now() & 0xffffffff;
    const bcast = tgt === 'ALL';
    const targetId = bcast ? 0 : parseInt(tgt, 10);
    if (!bcast && ![1, 2, 3].includes(targetId)) { this._emit({ t: 'error', msg: 'bad target' }); return; }
    const unicast = this.useMac && !bcast;
    // sent confirmation: a real ACK only for a MAC unicast; null in id mode.
    setTimeout(() => this._emit({ t: 'sent', target: tgt, text: msg, ack: bcast ? false : unicast ? true : null, bcast, ms }), 40);
    // node reports: who heard the frame, and whether it was for them
    const hearers = unicast ? [targetId] : [1, 2, 3];
    hearers.forEach((n, i) => setTimeout(() => {
      const accepted = bcast || n === targetId;
      this._emit({ t: accepted ? 'rx' : 'heard', from: '7c9ebda1' + ('0' + n).slice(-2) + '00', node: n, to: targetId, text: '', rssi: -38 - n * 3, ms: ms + 2 });
    }, 70 + i * 30));
  }

  async disconnect() { this.connected = false; }
}
