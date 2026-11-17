# Builds the matrix table (markdown) from evals/<platform>/<provider>/steps.json.
import json, glob, os
P = json.load(open('base/platforms.json')); provs = ['webrtc', 'daily', 'agora', 'vonage', 'zoom']
short = {'pass': 'pass', 'partial': 'partial', 'fail': 'fail', 'blocked': 'blocked'}
print('| # | Platform | Server kit | Client | ' + ' | '.join(provs) + ' |'); print('|' + '---|' * (4 + len(provs)))
notes = {}
for p in P:
    row = []
    for v in provs:
        f = f'evals/{p["slug"]}/{v}/steps.json'
        if v not in p['providers']: row.append('n/a'); continue
        if not os.path.exists(f): row.append('not run'); continue
        d = json.load(open(f)); t = d.get('first_session_seconds')
        cell = short.get(d.get('verdict'), d.get('verdict') or 'running') + (f' ({t:.0f}s)' if t else '')
        if v == p['video']: cell = '**' + cell + '**'
        row.append(f'[{cell}]({os.path.dirname(f)}/steps.json)')
    print(f'| {p["n"]} | {p["name"]} | {p["server"]} | {p["client"]} | ' + ' | '.join(row) + ' |')
