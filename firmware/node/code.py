# code.py — RX NODE for wireless-address-demo
#
# Runs on a XIAO ESP32-C3. One of three identical nodes; set MY_ID to 1, 2 or
# 3 before flashing each one. The node listens for ESP-NOW packets and blinks
# its LED when a packet is addressed to IT (target_id == MY_ID) or to everyone
# (target_id == 0, broadcast). Packets for other nodes are ignored — that's the
# whole point: addressing.
#
# On boot it PRINTS ITS OWN MAC ADDRESS. If you want the bridge to use real
# unicast (so only the addressed node even hears the packet), copy each node's
# printed MAC into the bridge's NODE_MACS and set USE_MAC = True there.
#
# An LED on D10 blinks on a hit. If you have a small OLED, you can show the
# text instead — left as an exercise; the LED is the reliable tour version.

import time
import struct
import board
import digitalio
import wifi
import espnow

MY_ID = 1                 # <-- set 1, 2 or 3 per node before flashing
CHANNEL = 6
MAGIC = 0xA5
BROADCAST = b"\xff\xff\xff\xff\xff\xff"
ECHO_BACK = True          # send a short ack-echo the bridge can show

wifi.radio.enabled = True
try:
    wifi.radio.start_ap(ssid="addr-demo-n%d" % MY_ID, channel=CHANNEL)
except Exception:
    pass

# Print our own MAC so you can fill the bridge's address table.
try:
    mac = wifi.radio.mac_address
    print("NODE", MY_ID, "MAC:", ":".join("%02x" % b for b in mac))
except Exception as ex:
    print("could not read MAC:", ex)

# LED
try:
    led = digitalio.DigitalInOut(board.D10)
    led.direction = digitalio.Direction.OUTPUT
except Exception:
    led = digitalio.DigitalInOut(board.LED)
    led.direction = digitalio.Direction.OUTPUT

e = espnow.ESPNow()
bcast = espnow.Peer(mac=BROADCAST, channel=CHANNEL)
e.peers.append(bcast)

def blink(times=3):
    for _ in range(times):
        led.value = True
        time.sleep(0.07)
        led.value = False
        time.sleep(0.07)

print("node", MY_ID, "listening on channel", CHANNEL)

while True:
    if e:
        p = e.read()
        if p is not None:
            msg = bytes(p.msg)
            if len(msg) >= 6 and msg[0] == MAGIC:
                target = msg[4]
                ln = msg[5]
                text = bytes(msg[6:6 + ln]).decode("utf-8", "replace")
                if target == 0 or target == MY_ID:
                    blink(3 if target == MY_ID else 2)   # longer for a direct hit
                    print("hit: target=%d text=%r" % (target, text))
                    if ECHO_BACK:
                        reply = struct.pack("<BBBBBB", MAGIC, 0x01, MY_ID, 0x41, 0, 0)
                        try:
                            e.send(reply, bcast)
                        except Exception:
                            pass
    else:
        time.sleep(0.003)
