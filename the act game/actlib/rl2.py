import struct, numpy as np
def parse(buf):
    nfr, nmap = struct.unpack_from('<HB', buf, 0)
    cmap = list(buf[4:4+nmap]) if nmap else None
    off = 4 + nmap
    frames = []
    for i in range(nfr):
        w,h,comp = struct.unpack_from('<HHB', buf, off)
        size, x, y = struct.unpack_from('<IHH', buf, off+8)
        frames.append(dict(w=w,h=h,comp=comp,size=size,x=x,y=y,data=off+16))
        off += 16 + size
    return cmap, frames, off
def decode(buf, fr, cmap):
    w,h = fr['w'], fr['h']
    out = np.full((h,w), 255, np.uint8)
    p = fr['data']
    if fr['comp'] == 0:
        out[:] = np.frombuffer(buf, np.uint8, w*h, p).reshape(h,w); return out
    for row in range(h):
        pos = 0; x = 0
        def nib():
            nonlocal pos
            b = buf[p + (pos>>1)]; v = (b>>4) if (pos&1)==0 else (b&15); pos += 1; return v
        def num(n):
            return n if n < 8 else ((n<<4)&0x70) | nib()
        def color():
            nonlocal pos
            if cmap is not None:
                v = nib()
                if v >= 8:
                    v = num(v)
                    if v == 0x7f:
                        w2 = nib(); w2 = num(w2) if w2 >= 8 else w2
                        v = (v + w2) & 0xff
                return cmap[v]
            q = p + (pos>>1)
            c = ((buf[q]<<4) | (buf[q+1]>>4)) & 0xff if pos&1 else buf[q]
            pos += 2; return c
        while True:
            n0 = nib()
            if n0:
                cnt = num(n0); c = color()
                if c != 255: out[row, x:x+cnt] = c
                x += cnt
            else:
                n1 = nib()
                if n1 == 0:
                    p += (pos + 1) >> 1; break
                if n1 == 1:
                    return out
                if n1 == 2:
                    x += 255; continue
                cnt = num(n1)
                for k in range(cnt):
                    c = color()
                    if c != 255 and x < w: out[row, x] = c
                    x += 1
    return out
def load_pal(path):
    d = open(path,'rb').read()
    return np.frombuffer(d, np.uint8).reshape(256,4)
