#!/usr/bin/env python3
"""Build + deploy Binge Addon (app/) to Vercel via the REST token route.
Usage: deploy-binge.py  (prints deployment id, polls until READY/ERROR)
Payload: every file under app/ except node_modules / .vercel, base64-inlined.
No env vars are touched; no catalog rebuild is triggered.
"""
import base64, json, os, subprocess, sys, time

APP = os.path.expanduser('~/workspace/bharat-streams/app')
HELPER = os.path.expanduser('~/workspace/custom-connectors/custom.vercel-rest/bin/vercel-rest.py')
TEAM = 'team_1T774NhZ0qNqvmri9AyIqUPz'
PROJECT = 'prj_oKm4isKC8VkBBT8kbLkpC2oqFXMq'
SKIP = {'node_modules', '.vercel', '.git'}

files = []
for root, dirs, names in os.walk(APP):
    dirs[:] = [d for d in dirs if d not in SKIP]
    for n in sorted(names):
        full = os.path.join(root, n)
        rel = os.path.relpath(full, APP)
        with open(full, 'rb') as f:
            data = base64.b64encode(f.read()).decode()
        files.append({'file': rel, 'data': data, 'encoding': 'base64'})
print(f'files: {len(files)}', flush=True)
for f in files:
    print('  ', f['file'], flush=True)

payload = {
    'name': 'binge-addon',
    'project': PROJECT,
    'target': 'production',
    'projectSettings': {'framework': None},
    'files': files,
}
with open('/tmp/binge-deploy-payload.json', 'w') as f:
    json.dump(payload, f)

def call(method, path, data_arg=None):
    cmd = ['python3', HELPER, method, path, '--team', TEAM]
    if data_arg:
        cmd += ['--data', data_arg]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr.strip()

rc, out, err = call('POST', '/v13/deployments?forceNew=1', '@/tmp/binge-deploy-payload.json')
print('create:', err, flush=True)
if rc != 0:
    print(out[-2000:])
    sys.exit(1)
dep = json.loads(out)
dep_id = dep.get('id')
print('deployment:', dep_id, 'url:', dep.get('url'), 'state:', dep.get('readyState'), flush=True)
if not dep_id:
    print(out[-2000:])
    sys.exit(1)

for _ in range(60):
    time.sleep(10)
    rc, out, err = call('GET', f'/v13/deployments/{dep_id}')
    if rc != 0:
        print('poll error:', err, out[-500:], flush=True)
        continue
    d = json.loads(out)
    state = d.get('readyState')
    print('poll:', state, flush=True)
    if state in ('READY', 'ERROR', 'CANCELED'):
        print(json.dumps({k: d.get(k) for k in ('id', 'url', 'readyState', 'createdAt')}, indent=2))
        sys.exit(0 if state == 'READY' else 1)
print('timed out waiting for READY')
sys.exit(1)
