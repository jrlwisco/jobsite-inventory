#!/usr/bin/env python3
"""Build Jobsite-Inventory-Windows.zip (double-click package for a Windows laptop).

Layout inside the zip:
  Jobsite Inventory/
    Start Inventory.bat, Backup Inventory.bat,
    Start automatically when Windows starts.bat, Stop starting automatically.bat,
    READ ME FIRST.txt
    app/  server/ public/ windows/launcher.js windows/backup.js
          package.json package-lock.json .npmrc README.md
No node_modules, data, screenshots, dev or .git. Usage: python3 dev/build_windows.py [out.zip]
"""
import os, sys, zipfile, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), 'Jobsite-Inventory-Windows.zip')
TOP = 'Jobsite Inventory'
TOP_FILES = ['Start Inventory.bat', 'Backup Inventory.bat', 'Start automatically when Windows starts.bat',
             'Stop starting automatically.bat', 'READ ME FIRST.txt']
APP_FILES = ['package.json', 'package-lock.json', '.npmrc', 'README.md', 'windows/launcher.js', 'windows/backup.js']
APP_DIRS = ['server', 'public']
SKIP = {'node_modules', 'data', '.git', '__pycache__'}

def add(zf, src, arc):
    zi = zipfile.ZipInfo(arc, time.localtime(os.path.getmtime(src))[:6])
    zi.compress_type = zipfile.ZIP_DEFLATED
    zi.external_attr = 0o644 << 16
    with open(src, 'rb') as f: zf.writestr(zi, f.read())

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as zf:
    for name in TOP_FILES:
        data = open(os.path.join(ROOT, 'windows', name), 'rb').read()
        assert data.count(b'\n') == data.count(b'\r\n'), name + ' must have CRLF line endings'
        add(zf, os.path.join(ROOT, 'windows', name), f'{TOP}/{name}')
    for name in APP_FILES:
        add(zf, os.path.join(ROOT, name), f'{TOP}/app/{name}')
    for d in APP_DIRS:
        for dp, dns, fns in os.walk(os.path.join(ROOT, d)):
            dns[:] = sorted(x for x in dns if x not in SKIP)
            for fn in sorted(fns):
                src = os.path.join(dp, fn)
                add(zf, src, f'{TOP}/app/' + os.path.relpath(src, ROOT).replace(os.sep, '/'))
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
