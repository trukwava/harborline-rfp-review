"""Browser component smoke test using live API snapshots injected into a sandboxed page.
Chromium in this environment blocks navigation to localhost, so network was not exercised in the browser.
API behavior is independently verified by tests/app.test.ts.
"""
import json,urllib.request,pathlib,sqlite3,base64
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
base='http://127.0.0.1:4173'
responses={}
for route in ['/api/session','/api/opportunities','/api/opportunities/1','/api/opportunities/2','/api/opportunities/3']:
 responses[route]=json.load(urllib.request.urlopen(base+route))
html=(root/'public/index.html').read_text().replace('<link rel="stylesheet" href="/styles.css">','').replace('<script defer src="/app.js"></script>','')
css=(root/'public/styles.css').read_text()
js=(root/'public/app.js').read_text()
con=sqlite3.connect(root/'data/review.sqlite')
preview=con.execute("SELECT preview_path FROM source_pages WHERE document_id=1 AND page_index=0").fetchone()[0]
img=base64.b64encode(pathlib.Path(preview).read_bytes()).decode()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--single-process'])
 page=browser.new_page(viewport={'width':1536,'height':1000},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html)
 page.add_style_tag(content=css)
 page.evaluate('''(snapshots)=>{window.fetch=async (url,options)=>{
   if(!snapshots[url])return new Response(JSON.stringify({error:'Unknown mocked route'}),{status:404,headers:{'Content-Type':'application/json'}});
   return new Response(JSON.stringify(snapshots[url]),{status:200,headers:{'Content-Type':'application/json'}});
 }}''',responses)
 page.add_script_tag(content=js)
 page.wait_for_timeout(500)
 assert page.locator('.opp-item').count()==3, page.locator('body').inner_text()[:500]
 assert page.locator('.field-item').count()==23
 assert 'Neighborhood Stabilization' in page.locator('.detail-head h2').inner_text()
 assert page.locator('#hero-count').inner_text()=='03'
 # A real command palette: keyboard accessible actions and authorized case navigation.
 page.keyboard.press('Control+k')
 assert page.locator('.command-dialog').is_visible()
 assert page.locator('.command-result').count()>=5
 page.locator('#command-search').fill('Source revisions')
 assert page.locator('.command-result').count()==1
 page.keyboard.press('Enter')
 assert page.locator('.revision-ledger').is_visible()
 page.keyboard.press('Control+k')
 page.locator('#command-search').fill('Intake & evidence')
 page.keyboard.press('Enter')
 assert page.locator('.field-item').count()==23
 page.locator('#command-trigger').click()
 page.keyboard.press('Escape')
 assert page.locator('.command-dialog').count()==0
 assert page.locator('.review-progress[role=progressbar]').count()==0  # inner track carries the aria semantics
 assert page.locator('.review-progress-track[role=progressbar]').get_attribute('aria-valuenow')=='0'
 page.locator('[data-field-filter=attention]').click()
 assert page.locator('.field-item').count()==23
 page.locator('[data-field-filter=verified]').click()
 assert page.locator('.no-results').count()==1
 page.locator('#clear-field-filters').click()
 page.locator('#field-search').fill('award maximum')
 assert page.locator('.field-item').count()==1
 assert 'Award maximum' in page.locator('.field-item').inner_text()
 page.locator('#field-search').fill('')
 page.locator('#toggle-evidence-focus').click()
 assert page.locator('.detail-area.focus-evidence').count()==1
 page.locator('#toggle-evidence-focus').click()
 assert page.locator('.detail-area.focus-evidence').count()==0
 page.locator('#next-action').click()
 assert page.locator('.field-item.selected').count()==1
 page.locator('[data-field-filter=all]').click()
 page.evaluate('''data=>{let im=document.querySelector('.source-preview img'); if(im) im.src='data:image/jpeg;base64,'+data;}''',img)
 page.screenshot(path=str(root/'docs/desktop-preview.png'),full_page=True)
 page.locator('button[data-tab="revisions"]').click()
 assert 'Every revision leaves a trace' in page.locator('.revision-masthead').inner_text()
 assert page.locator('.revision-stats').count()==1
 page.locator('[data-select-opp="3"]').click()
 page.wait_for_timeout(200)
 page.locator('button[data-tab="revisions"]').click()
 assert page.locator('.change-card').count()>=1, 'Amended example must show changed claims'
 page.screenshot(path=str(root/'docs/revisions-preview.png'),full_page=True)
 page.locator('.change-version').first.click()
 assert page.locator('.version-chooser .version-option').count()>=2, 'All versions remain inspectable'
 assert 'November 20' in page.locator('.evidence-pane').inner_text(), 'Selected original evidence must be inspectable'
 page.locator('button[data-tab="eligibility"]').click()
 assert 'Explicit requirement comparison' in page.locator('.panel-content').inner_text()
 page.locator('button[data-tab="history"]').click()
 assert 'Source documents' in page.locator('.panel-content').inner_text()
 page.locator('button[data-tab="intake"]').click()
 page.locator('button[data-field="award_maximum"]').click()
 assert 'Award maximum' in page.locator('.evidence-pane h3').inner_text()
 assert not errors,errors
 print('Browser visual component check: PASS (4 tabs, 23 fields, amendment comparison and citation inspection)')
 browser.close()
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--single-process'])
 page2=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
 page2.set_content(html);page2.add_style_tag(content=css)
 page2.evaluate('''(snapshots)=>{window.fetch=async url=>new Response(JSON.stringify(snapshots[url]||{error:'Unknown'}),{status:snapshots[url]?200:404,headers:{'Content-Type':'application/json'}})}''',responses)
 page2.add_script_tag(content=js);page2.wait_for_timeout(350)
 page2.evaluate('''data=>{let im=document.querySelector('.source-preview img'); if(im) im.src='data:image/jpeg;base64,'+data;}''',img)
 page2.wait_for_timeout(150)
 assert page2.locator('.opp-item').count()==3
 assert page2.locator('#mobile-profile').is_visible()
 assert page2.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1'), 'Mobile horizontal overflow'
 page2.locator('#mobile-profile').click()
 assert page2.locator('.modal').is_visible()
 page2.locator('[data-close-modal]').first.click()
 page2.screenshot(path=str(root/'docs/mobile-preview.png'),full_page=True)
 print('Mobile visual component check: PASS; screenshot saved')
 browser.close()
