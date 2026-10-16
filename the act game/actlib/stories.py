# actlib.stories - parser del formato de historias decaf (*.story / the_act_sequencestructure)
import os, re, posixpath
TYPES = {'Movie', 'Game', 'Story', 'Image', 'Menu', 'Action'}

class Story:
    def __init__(self, path, app):
        self.path = path; self.app = app
        self.dir = os.path.relpath(os.path.dirname(path), app).replace('\\', '/')
        if self.dir == '.': self.dir = ''
        self.defs = {}; self.order = []; self.trans = {}; self.base = ''
        for raw in open(path, encoding='latin1').read().splitlines():
            line = raw.strip()
            if not line or line.startswith('//'): continue
            f = [x.strip() for x in line.split(',')]
            if len(f) == 1: self.base = f[0]; continue
            if f[1] in TYPES:
                if f[0] not in self.defs: self.order.append(f[0])
                self.defs[f[0]] = dict(id=f[0], type=f[1], title=f[2] if len(f) > 2 else '', dir=f[3] if len(f) > 3 else '', file=f[4] if len(f) > 4 else '', extra=f[5:])
                continue
            if f[1] in self.defs and len(f) <= 3: continue
            lst = []
            for i in range(1, len(f) - 1, 2):
                ev, tg = f[i], f[i+1]
                if not ev: continue
                ev = ev.lstrip(':').rstrip(':')
                m = re.match(r'^(.*?)\((\d+)\)$', ev); det = int(m.group(2)) if m else None
                if m: ev = m.group(1).strip()
                lst.append((ev, det, tg))
            self.trans[f[0]] = lst
        self.root = posixpath.normpath(posixpath.join(self.dir, self.base.replace('\\', '/'))) if self.base else self.dir
        if self.root == '.': self.root = ''
    def movie_key(self, d):
        """ruta del .mov relativa a la raiz de la app (como la usa el runtime)."""
        p = '/'.join(x.replace('\\', '/') for x in (d['dir'], d['file']) if x)
        full = posixpath.normpath(posixpath.join(self.root, p)) if self.root else posixpath.normpath(p)
        return full.lstrip('./') if full.startswith('./') else full
    def targets(self, sid, skip_win=False):
        return [tg for ev, det, tg in self.trans.get(sid, []) if tg and not (skip_win and ev == 'win')]
    def win_target(self, sid):
        for ev, det, tg in self.trans.get(sid, []):
            if ev == 'win' and tg: return tg
        return None
    def intro_of(self, sid):
        for k, lst in self.trans.items():
            d = self.defs.get(k)
            if d and d['type'] == 'Movie' and any(ev == 'all' and tg == sid for ev, _, tg in lst): return k
        return None
    def lose_set(self, sid):
        """secuencias (Movie/Menu/Image) alcanzables tras perder en sid, sin entrar a otros juegos."""
        seen = set(); stack = self.targets(sid, skip_win=True)
        while stack:
            t = stack.pop()
            if t in seen or t not in self.defs: continue
            if self.defs[t]['type'] in ('Game', 'Story'): continue
            seen.add(t); stack += self.targets(t)
        return seen
