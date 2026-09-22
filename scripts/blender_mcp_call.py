#!/usr/bin/env python3
"""Small stdio client for the locally configured Blender MCP bridge."""

import json
import subprocess
import sys
import time


def send(proc: subprocess.Popen[str], message: dict) -> None:
    assert proc.stdin is not None
    proc.stdin.write(json.dumps(message) + "\n")
    proc.stdin.flush()


def receive(proc: subprocess.Popen[str], request_id: int, timeout: float = 30.0) -> dict:
    assert proc.stdout is not None
    deadline = time.time() + timeout
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            if proc.poll() is not None:
                details = proc.stderr.read() if proc.stderr is not None else ""
                raise RuntimeError(
                    f"MCP bridge exited with status {proc.returncode}: {details.strip()}"
                )
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        if message.get("id") == request_id:
            return message
    raise TimeoutError(f"Timed out waiting for MCP response {request_id}")


def main() -> int:
    action = sys.argv[1] if len(sys.argv) > 1 else "list"
    arguments = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    proc = subprocess.Popen(
        [
            "uvx",
            "--python",
            "/opt/homebrew/bin/python3.12",
            "--from",
            "git+https://github.com/ahujasid/blender-mcp",
            "mcp-for-blender",
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    try:
        send(
            proc,
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {"name": "ironstead-asset-client", "version": "1.0"},
                },
            },
        )
        receive(proc, 1)
        send(proc, {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})
        if action == "list":
            send(proc, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        else:
            send(
                proc,
                {
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/call",
                    "params": {"name": action, "arguments": arguments},
                },
            )
        print(json.dumps(receive(proc, 2), indent=2))
        return 0
    finally:
        proc.terminate()


if __name__ == "__main__":
    raise SystemExit(main())
