"""End-to-end browser test. Start the server first (python app.py), then: python tests/e2e_test.py"""
import sys, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5000'
SLUGS = ["tirumala-venkateswara","meenakshi-amman","jagannath","amarnath","golden-temple","kedarnath","kashi-vishwanath","sabarimala","shirdi-sai-baba","siddhivinayak"]
fails, passes = [], 0
def check(name, cond, detail=''):
    global passes
    if cond: passes += 1
    else: fails.append(f'{name} {detail}'); print('FAIL', name, detail)

def run(p, mobile=False):
    tag = 'mobile' if mobile else 'desktop'
    ctx = p.chromium.launch().new_context(**(p.devices['iPhone 13'] if mobile else dict(viewport={'width':1366,'height':800})))
    page = ctx.new_page(); errs = []; bad = []
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('response', lambda r: bad.append(f'{r.status} {r.url}') if r.status >= 400 else None)
    page.goto(BASE + '/'); page.wait_for_selector('.hero h1')
    check(f'{tag} home title', 'Bharat' in page.title())
    page.wait_for_selector('#home-search .card'); n = page.locator('#home-search .card').count(); check(f'{tag} home 10 cards', n == 10, n)
    # no horizontal overflow
    ov = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth'); check(f'{tag} home no h-scroll', ov <= 1, ov)
    page.screenshot(path=f'shots/{tag}-home.png')
    # nav links
    if mobile: page.click('#nav-toggle')
    for label, path in [('India','/india'),('All States','/states'),('Famous Temples','/temples'),('About','/about'),('Home','/')]:
        if mobile and not page.locator('#main-nav.open').count(): page.click('#nav-toggle')
        page.click(f'#main-nav >> text="{label}"'); page.wait_for_function(f'location.pathname=="{path}"'); page.wait_for_timeout(400)
        check(f'{tag} nav {label}', page.locator('#main-nav a.active').inner_text() == label, page.locator('#main-nav a.active').count())
    # profile icon removed
    check(f'{tag} no profile icon', page.locator('[aria-label*=rofile], [aria-label*=ccount], .profile, .user-icon').count() == 0)
    # header search overlay
    page.click('#search-open'); page.fill('#search-input', 'madurai'); page.wait_for_selector('#search-results .result-row')
    check(f'{tag} search city', page.locator('#search-results .result-row').count() == 1)
    for q, exp in [('kerala','Sabarimala'),('maharashtra',None),('Tamil Nadu','Meenakshi'),('puri','Jagannath'),('kashi','Kashi')]:
        page.fill('#search-input', q); page.wait_for_timeout(500)
        rows = page.locator('#search-results .result-row'); check(f'{tag} search {q}', rows.count() >= 1 and (exp is None or exp in rows.first.inner_text()), rows.count())
    check(f'{tag} maharashtra=2', (page.fill('#search-input','maharashtra') or page.wait_for_timeout(500) or page.locator('#search-results .result-row').count()) == 2)
    page.fill('#search-input', 'zzzqq'); page.wait_for_selector('#search-results .empty'); check(f'{tag} no-results msg', 'No temples found' in page.inner_text('#search-results'))
    page.click('#search-clear'); check(f'{tag} clear empties', page.input_value('#search-input') == '')
    page.fill('#search-input', 'shirdi'); page.wait_for_selector('#search-results .result-row'); page.click('#search-results .result-row'); page.wait_for_url('**/temple/shirdi-sai-baba')
    check(f'{tag} overlay closes on pick', page.locator('#search-overlay').is_hidden())
    # state filter on /temples
    page.goto(BASE + '/temples'); page.wait_for_selector('#t-list .card')
    page.select_option('#f-state', 'Maharashtra'); page.wait_for_timeout(500)
    check(f'{tag} state filter', page.locator('#t-list .card').count() == 2 and '?state=Maharashtra' in page.url)
    page.select_option('#f-state', 'Kerala'); page.wait_for_timeout(500); check(f'{tag} state Kerala', page.locator('#t-list .card').count() == 1)
    page.fill('#f-q', 'xyz'); page.wait_for_timeout(500); check(f'{tag} temples no-results', page.locator('#t-list .empty').count() == 1)
    page.click('[data-reset]'); page.wait_for_timeout(500); check(f'{tag} reset -> 10', page.locator('#t-list .card').count() == 10)
    # home state chips
    page.goto(BASE + '/'); page.wait_for_selector('#home-states .chip')
    page.click('#home-states .chip:has-text("Punjab")'); page.wait_for_timeout(500); check(f'{tag} home chip filter', page.locator('#home-states .card').count() == 1)
    # all temple pages
    for s in SLUGS:
        page.goto(BASE + '/temple/' + s); page.wait_for_selector('#gal figure'); page.wait_for_timeout(300)
        check(f'{tag} {s} h1', page.locator('h1').inner_text().strip() != '')
        for sec in ['s-overview','s-history','s-arch','s-sig','s-fest','s-gallery','s-related']: check(f'{tag} {s} #{sec}', page.locator('#'+sec).count() == 1)
        check(f'{tag} {s} related=3', page.locator('#s-related .card').count() == 3)
        check(f'{tag} {s} back btn', page.locator('a.back-link').count() == 1)
        # all rendered images in this temple's folder only
        srcs = page.eval_on_selector_all('#gal img, .t-hero img', 'els=>els.map(e=>e.getAttribute("src"))')
        check(f'{tag} {s} image isolation', all(f'/temples/{s}/' in x for x in srcs), [x for x in srcs if f'/temples/{s}/' not in x][:2])
        broken = page.evaluate('''async()=>{const imgs=[...document.querySelectorAll('#gal img')];imgs.forEach(i=>i.loading='eager');await Promise.all(imgs.map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r})));return imgs.filter(i=>!i.naturalWidth).length}''')
        check(f'{tag} {s} no broken thumbs', broken == 0, broken)
        ov = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth'); check(f'{tag} {s} no h-scroll', ov <= 1, ov)
    # lightbox on one temple
    page.goto(BASE + '/temple/kedarnath'); page.wait_for_selector('#gal figure')
    page.locator('#gal button').nth(2).click(); page.wait_for_selector('#lightbox:not([hidden])')
    page.wait_for_function('document.getElementById("lb-img").naturalWidth>0')
    c1 = page.inner_text('#lb-caption'); page.click('#lb-next'); page.wait_for_timeout(400); c2 = page.inner_text('#lb-caption'); check(f'{tag} lb next', c1 != c2 and '4 of' in c2, (c1, c2))
    page.click('#lb-prev'); page.wait_for_timeout(300); check(f'{tag} lb prev', '3 of' in page.inner_text('#lb-caption'))
    if not mobile: page.keyboard.press('ArrowRight'); page.wait_for_timeout(300); check(f'{tag} lb key', '4 of' in page.inner_text('#lb-caption')); page.keyboard.press('Escape')
    else:
        page.screenshot(path=f'shots/{tag}-lightbox.png')
        page.evaluate('''()=>{const el=document.getElementById("lightbox");const mk=(t,x)=>new TouchEvent(t,{changedTouches:[new Touch({identifier:1,target:el,clientX:x,clientY:300})],bubbles:true});el.dispatchEvent(mk("touchstart",300));el.dispatchEvent(mk("touchend",100));}''')
        page.wait_for_timeout(400); check(f'{tag} swipe next', '4 of' in page.inner_text('#lb-caption'), page.inner_text('#lb-caption'))
        page.click('#lb-close')
    check(f'{tag} lb closes', page.locator('#lightbox').is_hidden())
    # load more
    page.locator('#gal-more button').click(); page.wait_for_timeout(400); check(f'{tag} load more', page.locator('#gal figure').count() == 48, page.locator('#gal figure').count())
    page.screenshot(path=f'shots/{tag}-temple.png')
    # back/forward
    page.goto(BASE + '/'); page.click('a[href="/temples"] >> nth=0') if not mobile else page.goto(BASE + '/temples')
    page.wait_for_selector('#t-list .card'); page.click('#t-list .card >> nth=0'); page.wait_for_url('**/temple/**'); u = page.url
    page.go_back(); page.wait_for_selector('#t-list .card'); check(f'{tag} back', page.url.endswith('/temples'))
    page.go_forward(); page.wait_for_selector('#gal figure'); check(f'{tag} forward', page.url == u)
    # states
    page.goto(BASE + '/states'); page.wait_for_selector('#s-out .card'); check(f'{tag} states 36', page.locator('#s-out .card').count() == 36, page.locator('#s-out .card').count())
    page.check('#s-only'); page.wait_for_timeout(300); check(f'{tag} states with temples=9', page.locator('#s-out .card').count() == 9, page.locator('#s-out .card').count())
    page.goto(BASE + '/states/jammu-and-kashmir'); page.wait_for_selector('h1'); check(f'{tag} J&K page has Amarnath', 'Amarnath' in page.inner_text('main'))
    page.goto(BASE + '/states/goa'); page.wait_for_selector('h1'); check(f'{tag} Goa page empty temples msg', 'No featured temple' in page.inner_text('main'))
    # india tabs
    page.goto(BASE + '/india'); page.wait_for_selector('.map-svg'); check(f'{tag} map', page.locator('.map-svg .dot').count() >= 100 and page.locator('.map-svg .tm').count() == 10, page.locator('.map-svg .dot').count())
    page.screenshot(path=f'shots/{tag}-india.png')
    for tab, tot in [('monuments',120),('heritage',107),('museums',98),('art',110)]:
        page.click(f'.tabs button[data-tab={tab}]'); page.wait_for_selector('#d-out .count'); c = page.inner_text('#d-out .count'); check(f'{tag} {tab} total', c.startswith(str(tot)), c)
        page.fill('#d-q', 'zzzz'); page.wait_for_selector('#d-out .empty'); page.click('[data-dclear]'); page.wait_for_selector('#d-out .count')
    page.click('.tabs button[data-tab=monuments]'); page.select_option('#d-state', 'Kerala'); page.wait_for_timeout(500); check(f'{tag} monuments Kerala=4', page.inner_text('#d-out .count').startswith('4'), page.inner_text('#d-out .count'))
    page.click('.tabs button[data-tab=tourism]'); page.wait_for_selector('#t-bars .bar-row'); check(f'{tag} tourism bars', page.locator('#t-bars .bar-row').count() == 12 and page.locator('#t-table tbody tr').count() == 36)
    page.select_option('#t-metric', 'foreign_2023'); page.wait_for_timeout(300); check(f'{tag} tourism metric', 'foreign' in page.inner_text('#t-title'))
    page.screenshot(path=f'shots/{tag}-tourism.png')
    # about + 404
    page.goto(BASE + '/about'); page.wait_for_selector('h1'); check(f'{tag} about', 'About' in page.inner_text('h1'))
    page.goto(BASE + '/temple/nope'); page.wait_for_selector('.error-box'); check(f'{tag} temple 404 message', 'could not find' in page.inner_text('.error-box').lower())
    page.goto(BASE + '/nothing-here'); page.wait_for_selector('.error-box'); check(f'{tag} unknown route message', 'not found' in page.inner_text('.error-box').lower())
    real_bad = [b for b in bad if not b.startswith('404 ' + BASE + '/temple/nope') and '/api/temples/nope' not in b and '/nothing-here' not in b]
    real_errs = [e for e in errs if 'status of 404' not in e]
    check(f'{tag} no console errors', not real_errs, real_errs[:3]); check(f'{tag} no failed requests', not real_bad, real_bad[:3])
    ctx.close()
with sync_playwright() as p:
    run(p, False); run(p, True)
print(f'\n{passes} checks passed, {len(fails)} failed'); sys.exit(1 if fails else 0)
