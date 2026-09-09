"""Type a private key into `cast wallet import` over a pty, without it leaking.

Called only by scripts/keystore-import.sh, which supplies RAWKEY, NAME,
KEYS_DIR and CAST_UNSAFE_PASSWORD in the environment.

A pty is needed because `cast wallet import --interactive` refuses anything
that is not a terminal, and --interactive is the whole point: it is what keeps
the key off the argument vector, where /proc/<pid>/cmdline would expose it to
every user on the machine (/proc/<pid>/environ, by contrast, is owner-only).

⚠️ Four attempts, because the first three were wrong in ways that looked right:

1. `pty.spawn` with a pass-through reader. A pty ECHOES what is typed into it
   and `cast` does not turn echo off for this prompt, so the key was written to
   stdout and into the session transcript. Imported and leaked in one step.

2. The same, with the reader returning b"". That stopped the leak and broke the
   import: in `pty.spawn`, b"" from the master reader means EOF, so the child
   was torn down before it wrote the keystore -- silently, because the same
   reader was discarding the child's error output.

3. ECHO off, with stdout on a pipe. `cast` checks that its OUTPUT is a terminal
   too, and refused: "No such device or address".

4. ECHO off, pty on all three descriptors, `start_new_session=True`. Still
   ENXIO -- because `cast` opens /dev/tty directly, and a new session with no
   controlling terminal has no /dev/tty to open.

5. This one. The child calls setsid() and then claims the pty as its
   CONTROLLING terminal, which is what makes /dev/tty resolve. Echo stays off,
   so the key is typed into a terminal that never repeats it.
"""

import fcntl
import os
import selectors
import subprocess
import sys
import termios

key = os.environ.pop("RAWKEY")
argv = [
    "cast", "wallet", "import", os.environ["NAME"],
    "--keystore-dir", os.environ["KEYS_DIR"],
    "--interactive",
]

controller, follower = os.openpty()

# ⚠️ ECHO off, before anything is written. This is the line that keeps the key
# out of the output; everything else here is plumbing.
attrs = termios.tcgetattr(follower)
attrs[3] &= ~termios.ECHO          # attrs[3] is lflag
termios.tcsetattr(follower, termios.TCSANOW, attrs)

def _take_controlling_tty():
    # ⚠️ Runs in the child between fork and exec. setsid() detaches from the
    # parent's terminal and TIOCSCTTY claims this pty instead, so /dev/tty
    # resolves to it. Without this `cast` fails with ENXIO: it opens /dev/tty
    # for the prompt rather than reading descriptor 0.
    os.setsid()
    fcntl.ioctl(0, termios.TIOCSCTTY, 0)


proc = subprocess.Popen(
    argv, stdin=follower, stdout=follower, stderr=follower,
    close_fds=True, preexec_fn=_take_controlling_tty,
)
os.close(follower)

os.write(controller, (key + "\n").encode())

# Drain the terminal until the child is done. Reading a pty after the child
# exits raises EIO rather than returning EOF, so that is the normal ending.
captured = bytearray()
sel = selectors.DefaultSelector()
sel.register(controller, selectors.EVENT_READ)
try:
    while True:
        for _ in sel.select(timeout=0.2):
            chunk = os.read(controller, 4096)
            if not chunk:
                raise OSError
            captured.extend(chunk)
        if proc.poll() is not None and not sel.select(timeout=0.2):
            break
except OSError:
    pass
finally:
    sel.close()
    os.close(controller)

proc.wait(timeout=30)
text = captured.decode("utf8", "replace")

# Belt and braces: if a future version of cast echoes the key some other way,
# it still does not reach the terminal through this script.
bare = key.removeprefix("0x")
for form in (key, bare, "0x" + bare):
    text = text.replace(form, "<redacted>")

sys.stderr.write(text.strip() + "\n")
sys.exit(proc.returncode)
