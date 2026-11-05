# Protocol — wireless-address-demo

Uses the **shared bridge line-JSON** (115200 8N1) from
`packet-inspector-demo/PROTOCOL.md` for bridge→page messages, and adds a
**page→bridge command** direction this demo needs (the only demo that sends to
the bridge).

## Page → bridge (one command per line)

```
SEND <target> <text>        target = 1 | 2 | 3 | ALL
```

Example: `SEND 2 hello node` — message “hello node” to Node 2.
`SEND ALL go` — broadcast “go” to every node.

The page’s `js/bridge.js` `send()` writes these lines; the bridge parses them.

## Bridge → page (line-JSON)

### `hello`
```json
{"t":"hello","role":"bridge","proto":1,"channel":6,"use_mac":false}
```

### `sent` — confirmation of a SEND
```json
{"t":"sent","target":"2","text":"hello node","ack":true,"bcast":false,"ms":123}
```
- `ack` — radio-level ESP-NOW acknowledgement. **Only meaningful for unicast**
  (a specific node). For a broadcast, `bcast:true` and `ack` is not claimed.

### `rx` — a node reported receiving (optional echo-back)
```json
{"t":"rx","from":"7c9ebd...","node":2,"text":"","rssi":-40,"ms":124}
```
The page lights the node whose `node` id this carries.

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

## Addressing: two modes

- **Default (`USE_MAC = False`):** the bridge broadcasts; each node filters on
  `target_id`. Works with no MAC setup. Every node physically receives every
  packet and chooses whether to react — which is the “addressing is not
  privacy” teaching point.
- **Real unicast (`USE_MAC = True`):** fill the bridge’s `NODE_MACS` with the
  addresses each node prints on boot. A unicast then goes only to that node and
  the bridge reports the real ESP-NOW ACK.
