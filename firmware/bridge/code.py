# code.py — BRIDGE node for wireless-address-demo
#
# Runs on a XIAO ESP32-C3, tethered to the laptop. Besides reporting to the
# page, this bridge also RECEIVES commands from the page and TRANSMITS them over
# ESP-NOW. It can address one node or broadcast to all, and reports whether a
# unicast was acknowledged at the radio level.
#
# Page -> bridge (one command per line, over USB serial):
#   SEND <target> <text>     target = 1 | 2 | 3 | ALL
# Bridge -> page (line-JSON):
#   {"t":"hello","role":"bridge","proto":1,"channel":6}
#   {"t":"sent","target":"2","text":"hi","ack":true,"bcast":false,"ms":123}
#       ack is true/false only for a real MAC unicast (USE_MAC); with the
#       default id filter the frame goes out as a broadcast and ack is null —
#       the node's echo-back ("rx") is the confirmation then.
#   {"t":"rx","from":"aabb...","node":2,"text":"hi","rssi":-40,"ms":124}  (echo-back from nodes, optional)
#
# ADDRESSING: each node filters on a 1-byte node_id in the payload, and also
# listens to a true broadcast (node_id 0 = all). This works on day one without
# a MAC census. If you want REAL unicast by MAC, fill NODE_MACS below with the
# addresses each node prints on boot; set USE_MAC = True.
#
# Payload to nodes (little-endian):
#   off 0 1B magic 0xA5 | 1 1B version 0x01 | 2 1B from_id 0x00(bridge)
#   off 3 1B msg_type 0x40 | 4 1B target_id (0=all,1..3) | 5 1B text_len
#   off 6 .. text (<=40 bytes)
#   (no CRC needed here; ESP-NOW frames are CRC-checked in hardware)

import time
import struct
import binascii
import json
import sys
import wifi
import espnow

PROTO = 1
CHANNEL = 6
MAGIC = 0xA5
MSG_TYPE = 0x40

USE_MAC = False
BROADCAST = b"\xff\xff\xff\xff\xff\xff"
# Fill these from each node's boot printout if you set USE_MAC = True:
NODE_MACS = {1: None, 2: None, 3: None}

wifi.radio.enabled = True
try:
    wifi.radio.start_ap(ssid="addr-demo-br", channel=CHANNEL)
except Exception:
    pass

e = espnow.ESPNow()
bcast_peer = espnow.Peer(mac=BROADCAST, channel=CHANNEL)
e.peers.append(bcast_peer)

peers_by_id = {}
if USE_MAC:
    for nid, mac in NODE_MACS.items():
        if mac:
            p = espnow.Peer(mac=mac, channel=CHANNEL)
            e.peers.append(p)
            peers_by_id[nid] = p

def emit(obj):
    sys.stdout.write(json.dumps(obj, separators=(",", ":")))
    sys.stdout.write("\n")

emit({"t": "hello", "role": "bridge", "proto": PROTO, "channel": CHANNEL, "use_mac": USE_MAC})

def build(target_id, text):
    tb = text.encode("utf-8")[:40]
    body = struct.pack("<BBBBBB", MAGIC, 0x01, 0x00, MSG_TYPE, target_id & 0xFF, len(tb))
    return body + tb

def transmit(target_id, text):
    """Send to one node (unicast if we have its MAC) or broadcast.
    Returns (ack, bcast): ack is True/False for a real unicast, None when the
    frame went out as a broadcast filtered by id (no radio ACK exists)."""
    payload = build(target_id, text)
    bcast = (target_id == 0)
    unicast = (not bcast) and (target_id in peers_by_id)
    before = e.send_success
    try:
        if unicast:
            e.send(payload, peers_by_id[target_id])     # true unicast -> gets an ACK
        else:
            e.send(payload, bcast_peer)                  # broadcast -> no ACK
    except Exception as ex:
        emit({"t": "error", "msg": str(ex)})
        return False, bcast
    if not unicast:
        return None, bcast
    # Give the radio a moment to update the success counter.
    time.sleep(0.01)
    return (e.send_success > before), bcast

# Read commands from USB. sys.stdin.readline() blocks, so we poll non-blocking
# via supervisor if available; otherwise fall back to a simple readline loop.
import supervisor

buf = ""
while True:
    # Drain any ESP-NOW packets from nodes (optional echo-back).
    if e:
        p = e.read()
        if p is not None:
            msg = bytes(p.msg)
            node = msg[2] if len(msg) > 2 else 0
            text = ""
            if len(msg) >= 6 and msg[0] == MAGIC:
                ln = msg[5]
                text = bytes(msg[6:6 + ln]).decode("utf-8", "replace")
            emit({"t": "rx", "from": binascii.hexlify(bytes(p.mac)).decode(),
                  "node": node, "text": text, "rssi": p.rssi, "ms": p.time})

    # Read a command line if one is available.
    n = supervisor.runtime.serial_bytes_available
    if n:
        chunk = sys.stdin.read(n)
        for ch in chunk:
            if ch == "\n":
                line = buf.strip()
                buf = ""
                if line:
                    parts = line.split(" ", 2)
                    if len(parts) >= 3 and parts[0].upper() == "SEND":
                        tgt = parts[1].upper()
                        text = parts[2]
                        target_id = 0 if tgt == "ALL" else (int(tgt) if tgt.isdigit() else -1)
                        if target_id < 0:
                            emit({"t": "error", "msg": "bad target"})
                        else:
                            ack, bcast = transmit(target_id, text)
                            ms = time.monotonic_ns() // 1_000_000 & 0xFFFFFFFF
                            emit({"t": "sent", "target": tgt, "text": text,
                                  "ack": ack, "bcast": bcast, "ms": ms})
                    else:
                        emit({"t": "error", "msg": "unknown command"})
            else:
                buf += ch
                if len(buf) > 200:
                    buf = buf[-200:]
    else:
        time.sleep(0.003)
