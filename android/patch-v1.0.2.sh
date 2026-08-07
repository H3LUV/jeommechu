#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$ROOT/app-project"

python3 - "$PROJECT" <<'PY'
from pathlib import Path
import sys

project = Path(sys.argv[1])
build_file = project / "app/build.gradle.kts"
styles_file = project / "app/src/main/res/values/styles.xml"
activity_file = project / "app/src/main/java/com/jeommechu/app/MainActivity.java"

build = build_file.read_text(encoding="utf-8")
build = build.replace("targetSdk = 35", "targetSdk = 34")
build = build.replace("versionCode = 1", "versionCode = 3")
build = build.replace('versionName = "1.0.0"', 'versionName = "1.0.2"')
build_file.write_text(build, encoding="utf-8")

styles = styles_file.read_text(encoding="utf-8")
styles = styles.replace('        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>\n', '')
styles_file.write_text(styles, encoding="utf-8")

activity = activity_file.read_text(encoding="utf-8")
activity = activity.replace(
    "        super.onCreate(savedInstanceState);\n\n        FrameLayout root = new FrameLayout(this);",
    "        super.onCreate(savedInstanceState);\n"
    "        getWindow().setStatusBarColor(Color.WHITE);\n"
    "        getWindow().setNavigationBarColor(Color.WHITE);\n"
    "        getWindow().getDecorView().setSystemUiVisibility(\n"
    "                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR\n"
    "        );\n\n"
    "        FrameLayout root = new FrameLayout(this);\n"
    "        root.setFitsSystemWindows(true);",
)
activity = activity.replace("JeommechuAndroid/1.0", "JeommechuAndroid/1.0.2")
activity_file.write_text(activity, encoding="utf-8")
PY

printf 'Stable Android v1.0.2 patch applied at %s\n' "$PROJECT"
