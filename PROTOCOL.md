# Protocol — wireless-address-demo

Three parts: **page → bridge commands** (plain text lines), **bridge → page
reports** (line-JSON), and the **over-the-air payload** the bridge sends to the
nodes. Everything the page needs is defined here.

## Link

- USB serial (native USB Serial/JTAG on the XIAO C3), **115200 baud, 8N1**.
- Traffic goes **both ways**: the page sends one command per line; the bridge
  answers with one compact JSON object per line, newline-terminated.
- The page parses each JSON line and **ignores unknown `t` values and extra
  keys**. Partial lines are buffered until the newline arrives; lines that
  aren't valid JSON are skipped.
- Bridge and nodes pin **Wi-Fi channel 6**.

## Page → bridge (one command per line)

```
SEND <target> <text>        target = 1 | 2 | 3 | ALL
MODE ID | MODE MAC          switch addressing at runtime (answered with a `mode` line)
```

Example: `SEND 2 hello node` — message “hello node” to Node 2.
`SEND ALL go` — broadcast “go” to every node. `MODE MAC` — from now on a
single-node SEND is a true unicast to that node's MAC.

The page’s `js/bridge.js` `send()` writes these lines; the bridge parses them.

## Bridge → page (line-JSON)

### `hello`
```json
{"t":"hello","role":"bridge","proto":1,"channel":6,"use_mac":false}
```

### `mode` — answer to MODE
```json
{"t":"mode","use_mac":true,"known":[1,2,3]}
```
`known` lists the node ids whose MAC the bridge has learned (from their
reports, below). In MAC mode a SEND to a node not in `known` produces an
`error` and nothing is transmitted; send to `ALL` once so every node answers.

### `sent` — confirmation of a SEND
```json
{"t":"sent","target":"2","text":"hello node","ack":true,"bcast":false,"ms":123}
```
- `ack` — `true`/`false`: a real MAC unicast (MAC mode) was / was not
  acknowledged by the radio. `null`: the frame went out as a broadcast filtered
  by id (ID mode), so no radio ACK exists — the node's `rx` report is the
  confirmation. For `ALL`, `bcast:true` and `ack` is `false`.

### `rx` — a node ACCEPTED a packet (addressed to it, or to everyone)
```json
{"t":"rx","from":"7c9ebd...","node":2,"to":2,"text":"","rssi":-40,"ms":124}
```
The page lights the node brightly and bumps its **accepted** counter.

### `heard` — a node received a packet addressed to someone else
```json
{"t":"heard","from":"7c9ebd...","node":1,"to":2,"text":"","rssi":-40,"ms":124}
```
Only happens in ID mode (every node receives every broadcast). The page flashes
the node dimly and bumps its **heard** counter — the proof that addressing is a
filter, not privacy. In MAC mode the other nodes never receive the frame, so
there is nothing to report.

### `error`
```json
{"t":"error","msg":"bad target"}
```

## Over-the-air payload (bridge → nodes)

Little-endian, msg_type 0x40:

| Off | Len | Field       | Notes                         |
|-----|-----|-------------|-------------------------------|
| 0   | 1   | `magic`     | 0xA5                          |
| 1   | 1   | `version`   | 0x01                          |
| 2   | 1   | `from_id`   | 0x00 = bridge                 |
| 3   | 1   | `msg_type`  | 0x40                          |
| 4   | 1   | `target_id` | 0 = all, 1..3 = a node        |
| 5   | 1   | `text_len`  | length of the text that follows|
| 6   | …   | `text`      | UTF-8, ≤ 40 bytes             |

No app-level CRC — ESP-NOW frames are CRC-checked in hardware.

## Over-the-air report (nodes → bridge)

Same 6-byte header, sent as a broadcast so the bridge needs no peer table to
hear it. The bridge learns `node id → MAC` from byte 2 and the frame's source
address, which is what makes `MODE MAC` work with no configuration.

| Off | Len | Field       | Notes                                       |
|-----|-----|-------------|---------------------------------------------|
| 0   | 1   | `magic`     | 0xA5                                        |
| 1   | 1   | `version`   | 0x01                                        |
| 2   | 1   | `from_id`   | the node's id, 1..3                         |
| 3   | 1   | `msg_type`  | **0x41** accepted · **0x42** heard, not for me |
| 4   | 1   | `target_id` | the target the packet named (0 = all)       |
| 5   | 1   | `text_len`  | length of the text it carried (text not repeated) |

## Addressing: two modes, switched from the page

- **ID (default):** the bridge broadcasts; each node filters on `target_id`.
  Works with no MAC setup. Every node physically receives every packet and
  reports `heard` or `rx` — the “addressing is not privacy” teaching point.
- **MAC (`MODE MAC`):** a single-node SEND goes as a true ESP-NOW unicast to
  that node's learned MAC. Only that node receives the frame, and the bridge
  reports the real radio ACK. `SEND ALL` is still a broadcast. The bridge's
  `USE_MAC` constant only sets the starting mode; `NODE_MACS` can pre-fill
  the table but is normally left empty.

## Installing (the Firmware tab)

Not part of the demo protocol — this is how the page gets `code.py` onto a
board. Same port, 115200 8N1 (the C3's USB-JTAG/serial ignores the rate).
It is CircuitPython's raw REPL, the exchange Thonny and mpremote use:

| step | page sends | expects |
|---|---|---|
| interrupt | `\r\x03\x03` (up to 4×, with `\r` and `\x02` fallbacks) | `>>> ` |
| enter raw | `\r\x01` | `raw REPL; CTRL-B to exit\r\n>` |
| exec | code in 128-byte chunks, 8 ms apart, then `\x04` | `OK` · stdout · `\x04` · stderr · `\x04` · `>` |
| exit raw | `\r\x02` | `>>> ` |
| soft reboot | `\x04` at the friendly prompt | boot output until the role's first line (15 s max) |

The page sends `firmware/bridge/code.py`, or `firmware/node/code.py` with its
`MY_ID = …` line rewritten to 1, 2 or 3 for the button that was clicked. The
write is `f=open('code.py','wb')`, then one `f.write(b'…')` per 384-byte
chunk, `f.close()`, then the board prints `os.stat` size and `binascii.crc32`
of the file read back in 512-byte pieces. Both must match what was sent.

After the reboot the page waits for `{"t":"hello"…}` from a bridge, or
`node N listening on channel 6` from a node (and shows the `NODE N MAC: …`
line above it, for `NODE_MACS`).

A bare board (no REPL answers) gets CircuitPython first through
`flasher/` — the ROM bootloader protocol, handled by esptool-js.
