# Wiring — wireless-address-demo

Source of truth for the page’s hardware/wiring tables. `wiring.svg` is the
diagram; the page embeds an inline, theme-aware copy.

Four XIAO ESP32-C3 boards: one bridge + three nodes. No wiring between them —
all over ESP-NOW — and nothing is required on any board beyond its antenna
and USB. Each node blinks its onboard LED.

## Bridge (required)

| Signal           | XIAO C3 pin | Goes to | Note                          |
|------------------|-------------|---------|-------------------------------|
| USB data + power | USB-C       | Laptop  | The only required connection  |
| Antenna          | u.FL        | Whip    | Clip on firmly                |

Runs `../firmware/bridge/code.py`.

## Each node (×3, required)

| Signal        | XIAO C3 pin              | Note                                             |
|---------------|--------------------------|--------------------------------------------------|
| LED           | onboard                  | Blinks on a hit; no wiring                       |
| Bigger LED    | D10 → 220 Ω → LED → GND  | Optional, for a large room. Printed MOSI on the board; the firmware drives both |
| Antenna       | u.FL                     | Clip on firmly                                   |
| USB power     | USB-C                    | A USB bank each                                  |

Runs `../firmware/node/code.py` with `MY_ID` set to **1**, **2**, or **3** —
one per board. The page's Firmware tab sets `MY_ID` when you click
**Install node 1 / 2 / 3**; by hand, edit the line before copying the file.

## Notes

- All four boards are identical hardware; a board is whichever role it was
  last installed as. Label the nodes 1/2/3 so the audience can tell which
  blinked.
- Each node prints its MAC on boot (the Firmware tab's log shows it) — copy
  into the bridge’s `NODE_MACS` if you want real per-MAC unicast
  (`USE_MAC = True`). Otherwise nodes filter on the 1-byte id and it just
  works.
- All boards pin Wi-Fi channel 6.
- If you add wiring of your own, keep anything tied to ground at power-up off
  D0 (GPIO2), D8 (SCK, GPIO8) and D9 (MISO, GPIO9): they are ESP32-C3
  strapping pins.
