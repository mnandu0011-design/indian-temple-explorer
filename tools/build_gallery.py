import json, os, shutil
from PIL import Image, ImageOps
from concurrent.futures import ProcessPoolExecutor
from analyze_images import SLUG, SRC
meta=json.load(open('meta.json')); inv={v:k for k,v in SLUG.items()}
EXC={'amarnath':[25,27],'golden-temple':[26,37,44,98,99],
'kedarnath':[58,65,67,68,72,29,100,70,85,86],
'meenakshi-amman':[61,71,84],
'siddhivinayak':[17,38,41,42,45,49,53,70,71,73,81,86,88,89,95,98,100],
'sabarimala':[12,19,62,63,67,43,44,75,91,76,78,90,89,77,41,64,65,72,73,79,27,28],
'jagannath':[15,16,27,44,64,77,78,80,84,85,72,25,87,68,32,13],
'shirdi-sai-baba':[2,4,54,62,74,59],
'tirumala-venkateswara':[47,50,66,79,67,71,87,96,99,24,84,85,82]}
KASHI=[1,3,9,11,12,15,19,20,22,30,43,44,46,57,58,61,63,64,67,68,70,77,79,80,81,90]
HERO={'amarnath':[15,5,14],'golden-temple':[4,3,10,38],'kashi-vishwanath':[79,43,3],'kedarnath':[1,2,12,15],'meenakshi-amman':[1,3,4,7],'siddhivinayak':[1,4,6],'sabarimala':[6,7,1],'jagannath':[1,6,8,20],'shirdi-sai-baba':[1,11,6],'tirumala-venkateswara':[3,4,9]}
num=lambda r:int(r['src'].split('_')[1].split('.')[0])
def conv(a):
    slug,src,folder,idx=a; d=f'static/img/temples/{slug}'
    im=Image.open(f'{SRC}/{folder}/{src}'); im.seek(0); im=ImageOps.exif_transpose(im).convert('RGB')
    w,h=im.size; f=im.copy(); f.thumbnail((1400,1400),Image.LANCZOS); f.save(f'{d}/{idx:03d}.webp','WEBP',quality=74,method=4)
    t=im.copy(); t.thumbnail((480,480),Image.LANCZOS); t.save(f'{d}/t{idx:03d}.webp','WEBP',quality=70,method=4)
    return slug,idx,f.size
if __name__=='__main__':
    shutil.rmtree('static/img/temples',ignore_errors=True)
    jobs=[];out={}
    for slug,folder in inv.items():
        os.makedirs(f'static/img/temples/{slug}',exist_ok=True)
        L=[r for r in meta if r['slug']==slug and not r.get('dup')]
        L=[r for r in L if (num(r) in KASHI if slug=='kashi-vishwanath' else num(r) not in EXC.get(slug,[]))]
        L.sort(key=num)
        cand=[r for r in L if num(r) in HERO[slug]]
        cand.sort(key=lambda r:(-(r['w']>=900), HERO[slug].index(num(r))))
        hero=cand[0]; L.remove(hero); L.insert(0,hero)
        out[slug]=[]
        for i,r in enumerate(L,1):
            jobs.append((slug,r['src'],folder,i)); out[slug].append(dict(n=i,src=r['src'],ow=r['w'],oh=r['h']))
        print(slug,len(L),'hero',hero['src'],hero['w'],hero['h'])
    with ProcessPoolExecutor() as ex:
        for slug,idx,sz in ex.map(conv,jobs,chunksize=8): out[slug][idx-1]['w'],out[slug][idx-1]['h']=sz
    json.dump(out,open('data/gallery_manifest.json','w'))
    print(sum(len(v) for v in out.values()),'images kept')
