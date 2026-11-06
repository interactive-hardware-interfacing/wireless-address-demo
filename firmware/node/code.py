# code.py — RX NODE for wireless-address-demo
#
# Runs on a XIAO ESP32-C3. One of three identical nodes, told apart only by
# MY_ID (1, 2 or 3). The page's Firmware tab sets that line for you when you
# click "Install node 1/2/3"; by hand, edit it before copying the file over.
# The node listens for ESP-NOW packets and blinks its LED when a packet is
# addressed to IT (target_id == MY_ID) or to everyone (target_id == 0,
# broadcast). Packets for other nodes are ignored — that's the whole point:
# addressing.
#
# On boot it PRINTS ITS OWN MAC ADDRESS. If you want the bridge to use real
# unicast (so only the addressed node even hears the packet), copy each node's
# printed MAC into the bridge's NODE_MACS and set USE_MAC = True there.
#
# The onboard LED blinks on a hit, and so does an optional bigger LED on D10
# (D10 -> 220 ohm -> LED -> GND) if you want something the back row can see.

import time
import struct
import board
import digitalio
import wifi
import espnow

MY_ID = 1                 # <-- 1, 2 or 3; the Firmware tab sets this for you
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

# LEDs: the onboard one always, plus D10 for an external one. (Opening D10
# always succeeds whether or not an LED is wired, so this can't be a fallback;
# drive both.)
leds = []
for pin in (board.LED, board.D10):
    try:
        io = digitalio.DigitalInOut(pin)
        io.direction = digitalio.Direction.OUTPUT
        leds.append(io)
    except Exception:
        pass

def set_leds(on):
    for io in leds:
        io.value = on

e = espnow.ESPNow()
bcast = espnow.Peer(mac=BROADCAST, channel=CHANNEL)
e.peers.append(bcast)

def blink(times=3):
    for _ in range(times):
        set_leds(True)
        time.sleep(0.07)
        set_leds(False)
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
