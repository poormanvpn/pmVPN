#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""verify-paramiko.py — prove a pmVPN keyring key works from paramiko.

    python3 verify-paramiko.py --host HOST --base 2200 --key ~/.pmvpn/keys/HOST/k2-exec \
        [--user w1234abcd] [--index 2] [--command id]

Loads the key with paramiko.Ed25519Key (openssh-key-v1), connects to base+index,
runs the command, prints its output, and exits 0 on success. Pass --expect-fail to
assert that the server *refuses* the key on that port (index/port mismatch).

Heritage: cryptoAGI/csshd — the first wallet-login SSH server was paramiko.
"""
import argparse
import sys

try:
    import paramiko
except ImportError:  # pragma: no cover
    print("paramiko not installed: pip install paramiko", file=sys.stderr)
    sys.exit(2)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", required=True)
    ap.add_argument("--base", type=int, default=2200)
    ap.add_argument("--index", type=int, default=2, help="port offset; 2 = exec")
    ap.add_argument("--key", required=True, help="openssh-key-v1 private key file")
    ap.add_argument("--user", default="pmvpn", help="bound Linux user or the wallet address")
    ap.add_argument("--command", default="id")
    ap.add_argument("--expect-fail", action="store_true")
    args = ap.parse_args()

    key = paramiko.Ed25519Key.from_private_key_file(args.key)
    port = args.base + args.index
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            args.host, port=port, username=args.user, pkey=key,
            look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10,
        )
    except paramiko.AuthenticationException as e:
        if args.expect_fail:
            print(f"refused as expected on port {port}: {e}")
            return 0
        print(f"authentication failed on port {port}: {e}", file=sys.stderr)
        return 1
    if args.expect_fail:
        print(f"ERROR: port {port} accepted a key it should have refused", file=sys.stderr)
        client.close()
        return 1
    _, out, err = client.exec_command(args.command)
    o, e = out.read().decode(), err.read().decode()
    status = out.channel.recv_exit_status()
    client.close()
    sys.stdout.write(o)
    if e:
        sys.stderr.write(e)
    print(f"paramiko ok: {args.host}:{port} fingerprint {key.get_fingerprint().hex()} exit {status}")
    return 0 if status == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
