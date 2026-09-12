import subprocess
import time
import re
import sys
import os
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUDFLARED = os.path.join(BASE_DIR, 'bin', 'cloudflared.exe')

def is_server_running():
    try:
        urllib.request.urlopen('http://localhost:5000/api/network-info', timeout=2)
        return True
    except Exception:
        return False

def main():
    print('=' * 66)
    print('  RADARMARKET - GLOBAL PUBLIC HTTPS LAUNCHER')
    print('=' * 66)
    
    if not is_server_running():
        print('[1/2] Starting local backend server on port 5000...')
        subprocess.Popen([sys.executable, 'server.py'], cwd=BASE_DIR)
        time.sleep(2)
    else:
        print('[1/2] Local backend server is already running on port 5000.')

    print('[2/2] Connecting to Cloudflare global edge network...')
    cmd = [CLOUDFLARED, 'tunnel', '--url', 'http://localhost:5000']
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, encoding='utf-8', errors='replace')
    
    public_url = None
    for line in iter(p.stdout.readline, ''):
        m = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
        if m and not public_url:
            public_url = m.group(0)
            print('\n' + '=' * 66)
            print('  YOUR APPLICATION IS LIVE GLOBALLY!')
            print('=' * 66)
            print(f'  PUBLIC HTTPS URL: {public_url}')
            print('  * Share this link with ANYONE on mobile 4G/5G or any Wi-Fi!')
            print('  * Full live camera barcode scanner and GPS are active!')
            print('=' * 66 + '\n')
        if 'error' in line.lower() or 'registered tunnel' in line.lower():
            print(line.strip())

if __name__ == '__main__':
    main()
