"""Run a PowerShell script inside the Dune test VM over WinRM.

Taken from the KeySwitch validation harness (puntoswitcher build/windows-vm/harness/winrm_run.py),
whose prepared Windows image this VM was copied from (README.md); only the port differs, so both
VMs can run at once.

Usage:
  winrm_run.py wait [seconds]         - wait until WinRM answers
  winrm_run.py ps  < script.ps1        - run PowerShell from stdin
  winrm_run.py ps -c "Get-Date"        - run one PowerShell command
  winrm_run.py task <name> <file.ps1>  - run a script in the logged-on user's desktop session

The account and password come from the VM's Autounattend.xml and are never
printed. WinRM listens only on the host loopback (127.0.0.1:55986).
"""
from __future__ import annotations

import re
import sys
import time
from pathlib import Path

VM_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(VM_DIR / "control-python"))

import winrm  # noqa: E402

ENDPOINT = "http://127.0.0.1:55986/wsman"


def credentials() -> tuple[str, str]:
    text = (VM_DIR / "unattend" / "Autounattend.xml").read_text(encoding="utf-8")
    user = re.search(r"<Username>([^<]+)</Username>", text)
    password = re.search(r"<Password>\s*<Value>([^<]*)</Value>", text)
    if user is None or password is None:
        raise SystemExit("credentials not found in Autounattend.xml")
    return user.group(1), password.group(1)


def session() -> winrm.Session:
    user, password = credentials()
    return winrm.Session(
        ENDPOINT,
        auth=(user, password),
        transport="basic",
        read_timeout_sec=3600,
        operation_timeout_sec=3500,
    )


def wait(seconds: float) -> int:
    deadline = time.monotonic() + seconds
    last = ""
    while time.monotonic() < deadline:
        try:
            result = session().run_ps("$env:COMPUTERNAME")
            if result.status_code == 0:
                print("WinRM ready:", result.std_out.decode(errors="replace").strip())
                return 0
            last = result.std_err.decode(errors="replace")[:200]
        except Exception as error:  # noqa: BLE001 - any failure means "not yet"
            last = type(error).__name__
        time.sleep(5)
    print("WinRM did not answer:", last, file=sys.stderr)
    return 1


def run_ps(script: str) -> int:
    result = session().run_ps(script)
    sys.stdout.write(result.std_out.decode("utf-8", errors="replace"))
    error = result.std_err.decode("utf-8", errors="replace")
    # pywinrm returns PowerShell progress/CLIXML noise on stderr; keep real errors.
    if error.strip() and "#< CLIXML" not in error[:20]:
        sys.stderr.write(error)
    elif "<S S=\"Error\">" in error:
        cleaned = re.sub(r"_x000D__x000A_", "\n", error)
        sys.stderr.write("".join(re.findall(r'<S S="Error">(.*?)</S>', cleaned)) + "\n")
    return int(result.status_code)


def upload(local: Path, remote: str) -> int:
    """Copy a small file into the VM in chunks that fit one WinRM command line."""

    import base64

    data = base64.b64encode(local.read_bytes()).decode()
    chunk = 1800
    folder = remote.rsplit("\\", 1)[0]
    status = run_ps(
        f"New-Item -ItemType Directory -Force '{folder}' | Out-Null; "
        f"Set-Content -LiteralPath '{remote}.b64' -Value '' -NoNewline"
    )
    for start in range(0, len(data), chunk):
        piece = data[start:start + chunk]
        status = status or run_ps(f"Add-Content -LiteralPath '{remote}.b64' -Value '{piece}' -NoNewline")
    return status or run_ps(
        f"[IO.File]::WriteAllBytes('{remote}', [Convert]::FromBase64String("
        f"(Get-Content -LiteralPath '{remote}.b64' -Raw))); Remove-Item -LiteralPath '{remote}.b64'; "
        f"'uploaded ' + (Get-Item -LiteralPath '{remote}').Length + ' bytes to {remote}'"
    )


def task(name: str, script: str) -> int:
    """Run a PowerShell file in the logged-on user's desktop session.

    WinRM kills every process it started when its session closes, and its
    session has no desktop: keyboard hooks and SendInput need the console
    session of the user who is logged on. A scheduled task with an interactive
    principal runs exactly there and outlives this call.
    """

    user, _password = credentials()
    return run_ps(
        f"$action = New-ScheduledTaskAction -Execute 'powershell.exe' "
        f"-Argument '-NoProfile -ExecutionPolicy Bypass -File \"{script}\"'; "
        f"$principal = New-ScheduledTaskPrincipal -UserId '{user}' -LogonType Interactive -RunLevel Highest; "
        f"$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries "
        f"-ExecutionTimeLimit (New-TimeSpan -Hours 4); "
        f"Register-ScheduledTask -TaskName '{name}' -Action $action -Principal $principal -Settings $settings -Force | Out-Null; "
        f"Start-ScheduledTask -TaskName '{name}'; 'task {name} started'"
    )


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "task":
        return task(sys.argv[2], sys.argv[3])
    if command == "upload":
        return upload(Path(sys.argv[2]), sys.argv[3])
    if command == "wait":
        return wait(float(sys.argv[2]) if len(sys.argv) > 2 else 600)
    if command == "ps":
        if len(sys.argv) > 3 and sys.argv[2] == "-c":
            return run_ps(sys.argv[3])
        return run_ps(sys.stdin.read())
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
