"""
RadarMarket - Local Development Server Launcher
Starts a local web server and automatically opens your browser.
"""

import http.server
import socketserver
import webbrowser
import os
import sys

# Force UTF-8 on Windows terminal if available
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def run():
    port = PORT
    max_attempts = 15
    httpd = None

    for attempt in range(max_attempts):
        try:
            httpd = socketserver.TCPServer(("", port), Handler)
            break
        except OSError:
            port += 1

    if not httpd:
        print(f"Error: Could not bind to port {PORT}-{port-1}. Please check running processes.")
        sys.exit(1)

    url = f"http://localhost:{port}/index.html"
    print("=" * 60)
    print(" [*] RADARMARKET - LOCAL RADAR GRID SYSTEM ACTIVE")
    print("=" * 60)
    print(f" Local Web Server: {url}")
    print(" Serving stationary equipment & second-hand books radar.")
    print(" Press Ctrl+C in this terminal to stop the server.")
    print("=" * 60)

    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"Note: Could not open browser automatically: {e}")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nRadarMarket server stopped safely.")

if __name__ == "__main__":
    run()
