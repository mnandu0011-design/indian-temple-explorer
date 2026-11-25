import os, json, re, hashlib
from PIL import Image, ImageOps
from concurrent.futures import ProcessPoolExecutor
SRC='archive/indian_temples'  # path to the extracted original archive.zip
SLUG={'Amarnath Cave Temple':'amarnath','Golden Temple':'golden-temple','Kashi Vishwanath Temple':'kashi-vishwanath','Kedarnath Temple':'kedarnath','Meenakshi Amman Temple':'meenakshi-amman','Mumbai Siddhivinayak Temple':'siddhivinayak','Sabarimala Ayyappa Temple':'sabarimala','Shri Jagannath Temple':'jagannath','Shri Shirdi Sai Baba Temple':'shirdi-sai-baba','Tirumala Tirupati Venkateswara Temple':'tirumala-venkateswara'}
def key(f): return int(re.search(r'(\d+)',f).group(1))
def work(a):
    folder,f=a; slug=SLUG[folder]; p=f'{SRC}/{folder}/{f}'
    try:
        im=Image.open(p); im.seek(0); im=ImageOps.exif_transpose(im).convert('RGB')
    except Exception as e: return dict(slug=slug,src=f,err=str(e))
    w,h=im.size
    g=im.resize((9,8),Image.LANCZOS).convert('L'); px=list(g.getdata())
    bits=''.join('1' if px[r*9+c]>px[r*9+c+1] else '0' for r in range(8) for c in range(8))
    return dict(slug=slug,src=f,w=w,h=h,dh=int(bits,2),bytes=os.path.getsize(p))
if __name__=='__main__':
    jobs=[(d,f) for d in SLUG for f in sorted(os.listdir(f'{SRC}/{d}'),key=key)]
    with ProcessPoolExecutor() as ex: res=list(ex.map(work,jobs,chunksize=8))
    json.dump(res,open('meta.json','w'))
    errs=[r for r in res if 'err' in r]; print('total',len(res),'errors',len(errs),errs[:5])
    ok=[r for r in res if 'err' not in r]
    print('small(<500px short side):',sum(1 for r in ok if min(r['w'],r['h'])<500))
    import collections
    # near-duplicates within temple
    dup=0
    for s in SLUG.values():
        L=[r for r in ok if r['slug']==s]
        for i,a in enumerate(L):
            for b in L[:i]:
                if bin(a['dh']^b['dh']).count('1')<=4: dup+=1;break
    print('near dup',dup)
