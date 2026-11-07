# code.py — BRIDGE node for wireless-address-demo
#
# Runs on a XIAO ESP32-C3, tethered to the laptop. Besides reporting to the
# page, this bridge also RECEIVES commands from the page and TRANSMITS them over
# ESP-NOW. It can address one node or broadcast to all, and reports whether a
# unicast was acknowledged at the radio level.
#
# Page -> bridge (one command per line, over USB serial):
#   SEND <target> <text>     target = 1 | 2 | 3 | ALL
#   MODE ID | MODE MAC       switch addressing at runtime (see below)
# Bridge -> page (line-JSON):
#   {"t":"hello","role":"bridge","proto":1,"channel":6,"use_mac":false}
#   {"t":"mode","use_mac":true,"known":[1,2,3]}   answer to MODE (known = ids with a learned MAC)
#   {"t":"sent","target":"2","text":"hi","ack":true,"bcast":false,"ms":123}
#       ack is true/false only for a real MAC unicast; in id mode the frame
#       goes out as a broadcast and ack is null — the node's "rx" is the
#       confirmation then.
#   {"t":"rx","from":"aabb...","node":2,"to":2,"text":"","rssi":-40,"ms":124}     node ACCEPTED a packet
#   {"t":"heard","from":"aabb...","node":1,"to":2,"rssi":-40,"ms":124}            node heard one for someone else
#
# ADDRESSING, two modes, switchable from the page:
#   ID  (default): every frame is a broadcast; each node filters on the 1-byte
#       target_id in the payload. Every node hears every packet (and says so).
#   MAC: a single-node SEND goes as a true ESP-NOW unicast to that node's MAC;
#       only it receives the frame, and the radio reports a real ACK.
# The bridge learns each node's MAC from the reports nodes send back (byte 2
# is the node id, the frame's source is its MAC), so MODE MAC needs no editing:
# send something to ALL first so every node answers once. NODE_MACS below can
# still pre-fill the table.
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

USE_MAC = False            # starting mode; the page flips it with MODE MAC / MODE ID
BROADCAST = b"\xff\xff\xff\xff\xff\xff"
# Optional pre-fill (bytes, 6 long) from each node's boot printout; normally
# learned automatically from the nodes' reports.
NODE_MACS = {1: None, 2: None, 3: None}

wifi.radio.enabled = True
try:
    wifi.radio.start_ap(ssid="addr-demo-br", channel=CHANNEL)
except Exception:
    pass

e = espnow.ESPNow()
bcast_peer = espnow.Peer(mac=BROADCAST, channel=CHANNEL)
e.peers.append(bcast_peer)

peers_by_id = {}      # node id -> espnow.Peer, learned or pre-filled
macs_by_id = {}       # node id -> bytes

def learn(nid, mac):
    """Remember a node's MAC (and register it as a peer) the first time we hear it."""
    if nid < 1 or nid > 3 or mac in (None, BROADCAST):
        return
    if macs_by_id.get(nid) == mac:
        return
    old = peers_by_id.get(nid)
    if old is not None:
        try:
            e.peers.remove(old)
        except Exception:
            pass
    p = espnow.Peer(mac=mac, channel=CHANNEL)
    e.peers.append(p)
    peers_by_id[nid] = p
    macs_by_id[nid] = mac

for nid, mac in NODE_MACS.items():
    if mac:
        learn(nid, bytes(mac))

def emit(obj):
    sys.stdout.write(json.dumps(obj, separators=(",", ":")))
    sys.stdout.write("\n")

emit({"t": "hello", "role": "bridge", "proto": PROTO, "channel": CHANNEL, "use_mac": USE_MAC})

def build(target_id, text):
    tb = text.encode("utf-8")[:40]
    body = struct.pack("<BBBBBB", MAGIC, 0x01, 0x00, MSG_TYPE, target_id & 0xFF, len(tb))
    return body + tb

def transmit(target_id, text):
    """Send to one node (unicast in MAC mode) or broadcast.
    Returns (ack, bcast): ack is True/False for a real unicast, None when the
    frame went out as a broadcast filtered by id (no radio ACK exists)."""
    payload = build(target_id, text)
    bcast = (target_id == 0)
    unicast = USE_MAC and (not bcast) and (target_id in peers_by_id)
    if USE_MAC and not bcast and not unicast:
        emit({"t": "error", "msg": "no MAC known for node %d yet - send to ALL once so it answers" % target_id})
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
    # Drain reports from nodes: 0x41 = accepted, 0x42 = heard but not for me.
    p = e.read()
    if p is not None:
        msg = bytes(p.msg)
        if len(msg) >= 6 and msg[0] == MAGIC:
            node, kind, to, ln = msg[2], msg[3], msg[4], msg[5]
            text = bytes(msg[6:6 + ln]).decode("utf-8", "replace") if len(msg) > 6 else ""
            learn(node, bytes(p.mac))
            emit({"t": "heard" if kind == 0x42 else "rx", "from": binascii.hexlify(bytes(p.mac)).decode(),
                  "node": node, "to": to, "text": text, "rssi": p.rssi, "ms": p.time})

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
                    if len(parts) == 2 and parts[0].upper() == "MODE":
                        want = parts[1].upper()
                        if want == "MAC":
                            USE_MAC = True
                        elif want == "ID":
                            USE_MAC = False
                        else:
                            emit({"t": "error", "msg": "MODE ID or MODE MAC"})
                            continue
                        emit({"t": "mode", "use_mac": USE_MAC, "known": sorted(peers_by_id.keys())})
                    elif len(parts) >= 3 and parts[0].upper() == "SEND":
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
