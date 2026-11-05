# Wiring — wireless-address-demo

Source of truth for the page’s hardware/wiring tables. `wiring.svg` is the
diagram; the page embeds an inline, theme-aware copy.

Four XIAO ESP32-C3 boards: one bridge + three nodes. No wiring between them —
all over ESP-NOW. Each node has one LED.

## Bridge node (required)

| Signal           | XIAO C3 pin | Goes to | Note                          |
|------------------|-------------|---------|-------------------------------|
| USB data + power | USB-C       | Laptop  | The only required connection  |
| Antenna          | u.FL        | Whip    | Clip on firmly                |

Runs `../firmware/bridge/code.py`.

## Each node (×3, required)

| Signal    | XIAO C3 pin              | Note                                        |
|-----------|--------------------------|---------------------------------------------|
| LED       | D10 → 220 Ω → LED → GND  | Or use the onboard LED (firmware falls back)|
| Antenna   | u.FL                     | Clip on firmly                              |
| USB power | USB-C                    | A USB bank each                             |

Runs `../firmware/node/code.py` with `MY_ID` set to **1**, **2**, or **3** —
one per board.

## Notes

- All four boards are identical hardware; nodes differ only by `MY_ID`.
- Each node prints its MAC on boot — copy into the bridge’s `NODE_MACS` if you
  want real per-MAC unicast (`USE_MAC = True`). Otherwise nodes filter on the
  1-byte id and it just works.
- All boards pin Wi-Fi channel 6.
- Label the nodes 1/2/3 so the audience can tell which blinked.
