"""
Automated Android APK Compiler & Packager for Smart Budget & Saving Manager
Uses local Android Studio JBR and Android SDK build-tools.
"""

import os
import sys
import subprocess
import zipfile

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APK_BUILD_DIR = os.path.join(BASE_DIR, "apk_build")
BIN_DIR = os.path.join(APK_BUILD_DIR, "bin")
os.makedirs(BIN_DIR, exist_ok=True)

# SDK & JBR Paths
JAVA_BIN = r"C:\Program Files\Android\Android Studio\jbr\bin"
JAVAC = os.path.join(JAVA_BIN, "javac.exe")
JAVA = os.path.join(JAVA_BIN, "java.exe")
KEYTOOL = os.path.join(JAVA_BIN, "keytool.exe")

SDK_DIR = os.path.expandvars(r"%LOCALAPPDATA%\Android\Sdk")
BUILD_TOOLS_DIR = os.path.join(SDK_DIR, "build-tools", "35.0.0")
AAPT = os.path.join(BUILD_TOOLS_DIR, "aapt.exe")
D8_JAR = os.path.join(BUILD_TOOLS_DIR, "lib", "d8.jar")
ZIPALIGN = os.path.join(BUILD_TOOLS_DIR, "zipalign.exe")
APKSIGNER_JAR = os.path.join(BUILD_TOOLS_DIR, "lib", "apksigner.jar")
ANDROID_JAR = os.path.join(SDK_DIR, "platforms", "android-36", "android.jar")

def run(cmd, desc=""):
    print(f"--> {desc}...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"FAILED: {desc}")
        print("STDOUT:", res.stdout)
        print("STDERR:", res.stderr)
        sys.exit(1)
    return res

def main():
    print("=" * 65)
    print("🔨 BUILDING NATIVE ANDROID APK: SmartBudget.apk")
    print("=" * 65)

    # 1. Generate R.java
    manifest_xml = os.path.join(APK_BUILD_DIR, "AndroidManifest.xml")
    res_dir = os.path.join(APK_BUILD_DIR, "res")
    src_dir = os.path.join(APK_BUILD_DIR, "src")
    assets_dir = os.path.join(APK_BUILD_DIR, "assets")

    run([
        AAPT, "package", "-f", "-m",
        "-J", src_dir,
        "-M", manifest_xml,
        "-S", res_dir,
        "-I", ANDROID_JAR
    ], "Step 1: Generating R.java")

    # 2. Compile Java sources to .class
    classes_dir = os.path.join(BIN_DIR, "classes")
    os.makedirs(classes_dir, exist_ok=True)
    
    java_files = []
    for root, _, files in os.walk(src_dir):
        for f in files:
            if f.endswith(".java"):
                java_files.append(os.path.join(root, f))

    run([
        JAVAC,
        "-source", "17",
        "-target", "17",
        "-cp", ANDROID_JAR,
        "-d", classes_dir,
        *java_files
    ], "Step 2: Compiling Java sources")

    # 3. Compile bytecode to Dalvik Executable (classes.dex)
    class_files = []
    for root, _, files in os.walk(classes_dir):
        for f in files:
            if f.endswith(".class"):
                class_files.append(os.path.join(root, f))

    dex_out_dir = os.path.join(BIN_DIR, "dex")
    os.makedirs(dex_out_dir, exist_ok=True)

    run([
        JAVA, "-cp", D8_JAR,
        "com.android.tools.r8.D8",
        "--output", dex_out_dir,
        "--min-api", "24",
        *class_files
    ], "Step 3: Compiling classes to DEX")

    # 4. Package initial APK with resources and assets
    unsigned_apk = os.path.join(BIN_DIR, "app.unsigned.apk")
    if os.path.exists(unsigned_apk):
        os.remove(unsigned_apk)

    run([
        AAPT, "package", "-f",
        "-M", manifest_xml,
        "-S", res_dir,
        "-A", assets_dir,
        "-I", ANDROID_JAR,
        "-F", unsigned_apk
    ], "Step 4: Packaging resources & assets into APK")

    # Add classes.dex into unsigned_apk
    dex_path = os.path.join(dex_out_dir, "classes.dex")
    with zipfile.ZipFile(unsigned_apk, "a") as apk_zip:
        apk_zip.write(dex_path, "classes.dex")
    print("--> Added classes.dex into APK package...")

    # 5. Zipalign APK
    aligned_apk = os.path.join(BIN_DIR, "app.aligned.apk")
    if os.path.exists(aligned_apk):
        os.remove(aligned_apk)

    run([
        ZIPALIGN, "-f", "-p", "4",
        unsigned_apk,
        aligned_apk
    ], "Step 5: 4-byte ZipAligning APK")

    # 6. Generate Keystore if missing
    keystore = os.path.join(APK_BUILD_DIR, "debug.keystore")
    if not os.path.exists(keystore):
        run([
            KEYTOOL, "-genkeypair",
            "-validity", "10000",
            "-dname", "CN=SmartBudget,O=Android,C=IN",
            "-keystore", keystore,
            "-storepass", "android",
            "-keypass", "android",
            "-alias", "androiddebugkey",
            "-keyalg", "RSA",
            "-keysize", "2048"
        ], "Step 6: Creating debug signing key")

    # 7. Sign APK with apksigner
    final_apk = os.path.join(BASE_DIR, "SmartBudget.apk")
    if os.path.exists(final_apk):
        os.remove(final_apk)

    run([
        JAVA, "-jar", APKSIGNER_JAR,
        "sign",
        "--ks", keystore,
        "--ks-pass", "pass:android",
        "--key-pass", "pass:android",
        "--out", final_apk,
        aligned_apk
    ], "Step 7: Signing APK with apksigner (v2/v3 signature scheme)")

    # Verify APK signature
    run([
        JAVA, "-jar", APKSIGNER_JAR,
        "verify",
        "--verbose",
        final_apk
    ], "Step 8: Verifying APK signature")

    apk_size_mb = os.path.getsize(final_apk) / (1024 * 1024)
    print("=" * 65)
    print(f"🎉 APK BUILD SUCCESSFUL!")
    print(f"📦 Output APK: {final_apk}")
    print(f"📊 Size: {apk_size_mb:.2f} MB")
    print("=" * 65)

if __name__ == "__main__":
    main()
