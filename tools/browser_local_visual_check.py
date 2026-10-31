"""Local identity UI component smoke test. Network API behavior is tested by tests/app.test.ts.
Chromium in this sandbox forbids navigation to localhost; mocked fetch only drives the DOM.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'public/index.html').read_text().replace('<link rel="stylesheet" href="/styles.css">','').replace('<script defer src="/app.js"></script>','')
css=(root/'public/styles.css').read_text()
js=(root/'public/app.js').read_text()
mock="""
window._authenticated=false;
window.fetch=async (url,options={})=>{
  let body,status=200;
  if(url==='/api/session'){
    if(!window._authenticated){status=401;body={error:'Authentication required'};}
    else body={actor:'director@local.test',role:'director',organization:'fictional-org',demo:false};
  } else if(url==='/api/auth/login'){
    window._authenticated=true;body={actor:'director@local.test',role:'director',organization:'fictional-org',demo:false};
  } else if(url==='/api/auth/logout'){
    window._authenticated=false;body={ok:true};
  } else if(url==='/api/opportunities')body={opportunities:[],profile:null};
  else {status=404;body={error:'Mocked route not available'};}
  return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
};
"""
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'])
 try:
  for width,height,tag in [(1365,850,'desktop'),(390,844,'mobile')]:
   page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.set_content(html);page.add_style_tag(content=css);page.add_script_tag(content=mock);page.add_script_tag(content=js)
   page.locator('#login-form').wait_for()
   assert page.locator('#actor-select').is_hidden()
   assert page.locator('#new-opportunity').is_hidden()
   assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1')
   page.screenshot(path=str(root/f'docs/local-signin-{tag}.png'),full_page=True)
   page.locator('#login-email').fill('director@local.test')
   page.locator('#login-password').fill('synthetic-do-not-use')
   page.locator('#login-form button').click()
   page.locator('#signout').wait_for(state='visible')
   assert page.locator('#actor-select').is_hidden()
   assert page.locator('#new-opportunity').is_visible()
   assert 'FICTIONAL-ORG' in page.locator('.sidebar-bottom').inner_text().upper()
   assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1')
   page.screenshot(path=str(root/f'docs/local-workspace-{tag}.png'),full_page=True)
   page.locator('#signout').click();page.locator('#login-form').wait_for()
   assert page.locator('#new-opportunity').is_hidden()
   assert not errors,errors
   page.close()
  print('Local identity component visuals: PASS desktop/mobile sign-in, authenticated empty state, logout')
 finally:browser.close()
