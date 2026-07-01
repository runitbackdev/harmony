#!/bin/sh
# cargo runner passthrough for the x86_64-pc-windows-msvc target.
#
# cargo-xwin defaults the runner to `wine` (set only when the runner env var is
# unset). Wine has no WebView2 and dies on launch. On a Windows host under WSL2,
# WSLInterop executes a windows .exe natively when it is exec'd directly: the
# kernel's binfmt entry (magic "MZ" -> interpreter /init) hands it to Windows.
# So this runner just execs the binary as-is. No wine.
exec "$@"
