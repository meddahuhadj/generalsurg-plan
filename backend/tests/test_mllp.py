# -*- coding: utf-8 -*-
"""
tests/test_mllp.py — Transport MLLP réel, testé contre un vrai socket TCP
============================================================================
Un serveur MLLP minimal tourne dans un thread pendant le test (vrai socket
TCP sur 127.0.0.1, pas un mock de la couche réseau) : ces tests vérifient le
protocole d'encadrement MLLP (VT/FS/CR) et le décodage d'accusé pour de vrai.

Lancer : cd backend && pytest tests/test_mllp.py -v
"""
import socket
import threading
import time

import pytest

import mllp_client

VT, FS, CR = b"\x0b", b"\x1c", b"\x0d"


def _run_test_server(port: int, ack_code: str, received: list, ready: threading.Event):
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", port))
    srv.listen(1)
    srv.settimeout(5)
    ready.set()
    try:
        conn, _ = srv.accept()
    except socket.timeout:
        srv.close()
        return
    buf = b""
    while FS not in buf:
        chunk = conn.recv(4096)
        if not chunk:
            break
        buf += chunk
    msg = buf.strip(VT + FS + CR).decode("utf-8")
    received.append(msg)
    msg_id = "X"
    for line in msg.replace("\r", "\n").split("\n"):
        if line.startswith("MSH"):
            fields = line.split("|")
            msg_id = fields[9] if len(fields) > 9 else "X"
    ack = f"MSH|^~\\&|TEST|TEST|SENDER|SENDER|20260705||ACK|ACK{msg_id}|P|2.5\rMSA|{ack_code}|{msg_id}\r"
    conn.sendall(VT + ack.encode("utf-8") + FS + CR)
    conn.close()
    srv.close()


def _start_server(port: int, ack_code: str):
    received: list = []
    ready = threading.Event()
    t = threading.Thread(target=_run_test_server, args=(port, ack_code, received, ready), daemon=True)
    t.start()
    ready.wait(timeout=2)
    time.sleep(0.05)  # laisse le temps au listen() de vraiment être prêt
    return t, received


def test_send_success_positive_ack():
    thread, received = _start_server(28575, "AA")
    cfg = mllp_client.MllpConfig(host="127.0.0.1", port=28575, timeout_seconds=3)
    result = mllp_client.send_hl7_message(cfg, "MSH|^~\\&|A|B|C|D|20260705||ADT^A08|MSG123|P|2.5\rPID|1||P1")
    thread.join(timeout=2)
    assert result["ack_code"] == "AA"
    assert len(received) == 1
    assert "MSG123" in received[0]


def test_send_negative_ack_raises():
    thread, _ = _start_server(28576, "AE")
    cfg = mllp_client.MllpConfig(host="127.0.0.1", port=28576, timeout_seconds=3)
    with pytest.raises(mllp_client.MllpError, match="négatif"):
        mllp_client.send_hl7_message(cfg, "MSH|^~\\&|A|B|C|D|20260705||ADT^A08|MSG456|P|2.5\rPID|1||P1")
    thread.join(timeout=2)


def test_connection_refused_raises_fast():
    cfg = mllp_client.MllpConfig(host="127.0.0.1", port=28599, timeout_seconds=2)  # rien n'écoute ici
    t0 = time.time()
    with pytest.raises(mllp_client.MllpError, match="impossible"):
        mllp_client.send_hl7_message(cfg, "MSH|^~\\&|A|B|C|D|20260705||ADT^A08|MSG789|P|2.5")
    assert time.time() - t0 < 3.0  # échec net (connexion refusée), pas d'attente du plein timeout (3s)


def test_config_requires_host():
    with pytest.raises(mllp_client.MllpError, match="configuré"):
        mllp_client.MllpConfig.resolve(None, None)


def test_mllp_framing_is_correct():
    """Vérifie que le message est bien encadré VT...FS CR, sans quoi un vrai
    récepteur MLLP (Mirth, Ensemble...) rejetterait la trame."""
    thread, received = _start_server(28577, "AA")
    cfg = mllp_client.MllpConfig(host="127.0.0.1", port=28577, timeout_seconds=3)
    mllp_client.send_hl7_message(cfg, "MSH|^~\\&|A|B|C|D|20260705||ADT^A08|MSGFRAME|P|2.5")
    thread.join(timeout=2)
    assert received[0] == "MSH|^~\\&|A|B|C|D|20260705||ADT^A08|MSGFRAME|P|2.5"
