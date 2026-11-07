# wireless-address-demo

A browser demo of wireless addressing: three identical Seeed XIAO ESP32-C3
nodes, each with an address. Pick a recipient, send a message, and **only that
node lights up** — or broadcast to all three. Over Web Serial, no install, no
server.

**Live page:** <https://interactive-hardware-interfacing.github.io/wireless-address-demo/>
· **Try without hardware** runs the whole page against a built-in simulator.

Part of [Interactive Hardware Interfacing](https://interactive-hardware-interfacing.github.io/).
Self-contained — copies nothing from the other demos at runtime.

## What you see

- A **send panel**: type a message, pick Node 1/2/3/All, Send.
- A **node diagram** where only the addressed node(s) flash — mirroring the
  real LEDs blinking across the room.
- **ACK status** for unicast (and the honest note that broadcast has no ACK).

## Hardware

Four XIAO ESP32-C3 boards, all identical:

- **Bridge** — plugged into the laptop; runs [`firmware/bridge/code.py`](firmware/bridge/code.py).
- **Node 1/2/3** — nothing wired (the onboard LED blinks; an optional bigger
  LED goes on D10), on USB power; run [`firmware/node/code.py`](firmware/node/code.py)
  with `MY_ID` = 1, 2, 3 — the page sets that for you.

Addressing works out of the box via a node-id filter; flip `USE_MAC` on for
real per-MAC unicast. Wiring in [`wiring/`](wiring/), protocol in
[`PROTOCOL.md`](PROTOCOL.md) (this one adds a page→bridge command direction).

## Putting the firmware on the boards

The page does it. Open the **Firmware** tab, plug in a XIAO ESP32-C3, click
**Install bridge** or **Install node 1 / 2 / 3**, pick the port. The page
writes `code.py` through CircuitPython's raw REPL over Web Serial (the C3 has
no `CIRCUITPY` drive, so this is the only USB path), with `MY_ID` already set
for a node, verifies size and CRC32 on the board, reboots it, and waits for
the bridge's hello or the node's "listening" line. A board is whichever role
it was last given.

A board that has never run CircuitPython needs it installed once: download
the `.bin` for the XIAO ESP32-C3 from
[circuitpython.org](https://circuitpython.org/board/seeed_xiao_esp32c3/),
pick it on the Firmware tab, click **Flash CircuitPython**. That path uses
[esptool-js](https://github.com/espressif/esptool-js), kept in
[`flasher/`](flasher/) under its own licence.

## What's in the repo

| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/app.js` | The page: instrument, plus Hardware / Firmware / About views (`js/views.js`). |
| `js/bridge.js`, `js/sim.js` | Web Serial reader/writer for the bridge's line-JSON, and a simulator that answers like three nodes. |
| `js/install.js`, `js/device/` | The Firmware tab: CircuitPython raw REPL over Web Serial (write, verify, reboot). |
| `flasher/` | CircuitPython flashing for a bare board (esptool-js). Apache-2.0, see `LICENSES.md`. |
| `firmware/bridge/code.py`, `firmware/node/code.py` | One CircuitPython file per role; the node file serves all three nodes. |
| `PROTOCOL.md`, `wiring/` | The serial contract (both directions) and the hookup. |

## Addressing switch and sniffer view

The **Addressing** switch on the instrument flips the bridge between
*node-id filter* (every frame is a broadcast; nodes filter on a byte) and
*MAC unicast* (a single-node send goes to that node's radio address). Each
node card counts what it **heard** (received, not for me) and what it
**accepted**. In id mode a send to Node 2 ticks *heard* on 1 and 3; in MAC
mode they never see the frame. That's the unicast-vs-broadcast lesson in one
click. The bridge learns the MACs from the nodes' reports, so send to *All*
once before switching.

## Logging data and presenter mode

The **Data logging** panel records every send (`sends.csv`: target, text,
mode, ACK), every node report (`rx.csv`: node, accepted 1/0) and labelled
marks into one `.zip`, kept in memory until Download. **Presenter** (or `P`)
hides the log and enlarges the node bulbs for a projector; `Esc` leaves it.

## Run locally

```
python -m http.server 8000
```

then open <http://localhost:8000/>. Web Serial needs HTTPS or localhost.

## Browser support

Chrome or Edge on a laptop/desktop. The simulator works anywhere.

## License

GPL-2.0 (see [`LICENSE`](LICENSE)), except `flasher/`, which is Apache-2.0
because it bundles esptool-js — see [`LICENSES.md`](LICENSES.md).
Maintained by [LC Linkous](https://github.com/LC-Linkous).
