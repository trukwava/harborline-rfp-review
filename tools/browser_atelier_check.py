"""Visual release checks for the Evidence Atelier v0.6.
Screenshots use API snapshots, not a live browser connection to localhost.
The live HTTP behavior is independently verified by tests/app.test.ts.
"""
import json, urllib.request, pathlib, sqlite3, base64
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
base='http://127.0.0.1:4173'
responses={route:json.load(urllib.request.urlopen(base+route)) for route in [
 '/api/session','/api/opportunities','/api/opportunities/1','/api/opportunities/2','/api/opportunities/3']}
html=(root/'public/index.html').read_text().replace('<link rel="stylesheet" href="/styles.css">','').replace('<script defer src="/app.js"></script>','')
css=(root/'public/styles.css').read_text()
js=(root/'public/app.js').read_text()
with sqlite3.connect(root/'data/review.sqlite') as con:
 preview=con.execute('SELECT preview_path FROM source_pages WHERE document_id=1 AND page_index=0').fetchone()[0]
image=base64.b64encode(pathlib.Path(preview).read_bytes()).decode()

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'])
 for size,name in [((1440,930),'desktop'),((390,844),'mobile')]:
  page=browser.new_page(viewport={'width':size[0],'height':size[1]},device_scale_factor=1)
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html)
  page.add_style_tag(content=css)
  page.evaluate('''snapshots=>{window.fetch=async url=>new Response(JSON.stringify(snapshots[url]||{error:'No mocked route'}),{status:snapshots[url]?200:404,headers:{'Content-Type':'application/json'}})}''',responses)
  page.add_script_tag(content=js)
  page.wait_for_timeout(900)
  assert page.locator('.opp-item').count()==3
  assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1'),f'{name} horizontal overflow'
  page.evaluate('''image=>{let im=document.querySelector('.source-preview img');if(im)im.src='data:image/jpeg;base64,'+image}''',image)
  page.screenshot(path=str(root/f'docs/atelier-{name}.png'),full_page=False)
  page.keyboard.press('Control+k')
  assert page.locator('.command-dialog').is_visible()
  page.locator('#command-search').fill('Workforce')
  assert page.locator('.command-result').count()==1
  page.wait_for_timeout(400)  # Finish opening animation before release photography
  page.screenshot(path=str(root/f'docs/atelier-command-{name}.png'),full_page=False)
  page.keyboard.press('Enter')
  page.locator('.detail-head h2').filter(has_text='Workforce').wait_for(timeout=4000)
  page.keyboard.press('Control+k');page.keyboard.press('Escape')
  assert page.locator('.command-dialog').count()==0
  assert not errors,errors
  print(f'Atelier visual check: {name.upper()} PASS · command palette · no overflow')
  page.close()
 browser.close()
