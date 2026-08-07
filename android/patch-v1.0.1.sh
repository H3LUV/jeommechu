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
build = build.replace("versionCode = 1", "versionCode = 2")
build = build.replace('versionName = "1.0.0"', 'versionName = "1.0.1"')
build_file.write_text(build, encoding="utf-8")

styles = styles_file.read_text(encoding="utf-8")
needle = '        <item name="android:windowActionModeOverlay">true</item>\n'
replacement = needle + '        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>\n'
if replacement not in styles:
    styles = styles.replace(needle, replacement)
styles_file.write_text(styles, encoding="utf-8")

activity = activity_file.read_text(encoding="utf-8")
activity = activity.replace(
    "        super.onCreate(savedInstanceState);\n\n        FrameLayout root = new FrameLayout(this);",
    "        super.onCreate(savedInstanceState);\n        configureSystemBars();\n\n        FrameLayout root = new FrameLayout(this);\n        root.setFitsSystemWindows(true);",
)

method = '''    private void configureSystemBars() {
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(true);
            android.view.WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                int appearance = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(appearance, appearance);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                            | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            );
        }
    }

'''
marker = "    private void configureWebView() {\n"
if method not in activity:
    activity = activity.replace(marker, method + marker)
activity = activity.replace("JeommechuAndroid/1.0", "JeommechuAndroid/1.0.1")
activity_file.write_text(activity, encoding="utf-8")
PY

printf 'Android v1.0.1 system-bar patch applied at %s\n' "$PROJECT"
