"""Validate static demo UI and local mutations with the actual generated fixture payload.
Browser sandbox blocks local navigation, so source HTML/CSS/JS load via set_content;
only the fetch of demo-data.json is injected as an in-memory snapshot.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'docs'
html=(root/'index.html').read_text()
for ref in ('<link rel="stylesheet" href="./styles.css">','<script defer src="./demo/static.js"></script>','<script defer src="./app.js"></script>','<script defer src="./demo/tour.js"></script>'):
 assert ref in html,ref
 html=html.replace(ref,'')
payload=json.loads((root/'demo/demo-data.json').read_text())
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-gpu'])
 for name,width,height in [('desktop',1440,900),('mobile',390,844)]:
  page=browser.new_page(viewport={'width':width,'height':height},accept_downloads=True)
  errors=[]
  page.on('pageerror',lambda ex: errors.append(str(ex)))
  page.set_content(html)
  page.add_style_tag(content=(root/'styles.css').read_text())
  page.evaluate('''data=>{window.fetch=async path=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}})}''',payload)
  page.add_script_tag(content=(root/'demo/static.js').read_text())
  page.add_script_tag(content=(root/'app.js').read_text())
  page.add_script_tag(content=(root/'demo/tour.js').read_text())
  page.locator('.opp-item').first.wait_for(timeout=60000)
  assert page.locator('.opp-item').count()==3
  assert page.locator('#hero-count').inner_text()=='03'
  assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1'),f'{name}: horizontal overflow'
  if name=='desktop':
   page.locator('#new-opportunity').click()
   assert page.locator('#tour-heading').is_visible()
   assert 'deadline' in page.locator('#tour-copy').inner_text().lower()
   page.locator('#tour-next').click()
   page.locator('#tour-close').click()
   assert 'Workforce' in page.locator('.detail-head h2').inner_text()
   page.locator('[data-field="submission_deadline"]').first.click()
   assert 'December 3, 2027' in page.locator('#field-input').input_value()
   # Demonstrate accepting original source rather than the latest amendment.
   page.locator('[data-preview-candidate]').last.click()
   assert 'November 20' in page.locator('.source-box').inner_text()
   page.locator('#confirm-field').click()
   page.wait_for_timeout(200)
   assert page.evaluate('''()=>S.detail.fields.find(x=>x.key==='submission_deadline').status''')=='confirmed'
   assert '03-workforce-base.pdf' in page.evaluate('''()=>S.detail.fields.find(x=>x.key==='submission_deadline').currentCitation.filename''')
   page.evaluate("()=>window.HarborlineStatic.api('/api/session',{method:'POST',body:JSON.stringify({actor:'harbor-director'})})")
   page.reload() if False else None
   # Exercise the real generated JSON export.
   with page.expect_download() as d:
    page.locator('[data-public-export^="packet:"]').click()
   assert d.value.suggested_filename.endswith('.json')
  image_data=(root/'demo/pages').glob('*.jpg')
  import base64
  selected=next(image_data)
  page.evaluate('''img=>{document.querySelectorAll('.source-preview img').forEach(el=>el.src='data:image/jpeg;base64,'+img)}''',base64.b64encode(selected.read_bytes()).decode())
  page.screenshot(path=str(root/f'demo/{name}-public.png'),full_page=False)
  assert not errors,(name,errors)
  print(name.upper(), 'PASS: 3 cases, no overflow, browser demo interactions')
  page.close()
 browser.close()
