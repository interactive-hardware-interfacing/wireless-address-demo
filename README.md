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
- **Node 1/2/3** — each with an LED on D10 (or the onboard LED), on USB power;
  run [`firmware/node/code.py`](firmware/node/code.py) with `MY_ID` = 1, 2, 3.

Addressing works out of the box via a node-id filter; flip `USE_MAC` on for
real per-MAC unicast. Wiring in [`wiring/`](wiring/), protocol in
[`PROTOCOL.md`](PROTOCOL.md) (this one adds a page→bridge command direction).

## Run locally

```
python -m http.server 8000
```

then open <http://localhost:8000/>. Web Serial needs HTTPS or localhost.

## Browser support

Chrome or Edge on a laptop/desktop. The simulator works anywhere.

## License

GPL-2.0 (see [`LICENSE`](LICENSE)). Maintained by [LC Linkous](https://github.com/LC-Linkous).
