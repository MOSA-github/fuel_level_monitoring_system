const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try{
 const page=await browser.newPage({viewport:{width:1360,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 let configs=JSON.parse(fs.readFileSync('tests/fixtures/demo.json','utf8'));
 let ref='head0',trees=[],blobs=new Map(),uploadedAssets=new Map(),writes=[],rejectUpdate=true;
 await page.route('**/data/gauges.json*',r=>r.fulfill({json:configs}));
 await page.route('**/assets/demo-images/*.png',r=>{
  const path=new URL(r.request().url()).pathname.replace(/^\//,'');
  assert.ok(uploadedAssets.has(path),'image must exist in the published commit');
  return r.fulfill({body:uploadedAssets.get(path),contentType:'image/png'});
 });
 await page.route('https://api.github.com/repos/MOSA-github/fuel_level_monitoring_system/**',async route=>{
  const req=route.request(),path=req.url().split('/fuel_level_monitoring_system/')[1],body=req.postDataJSON();
  if(req.method()!=='GET')writes.push({path,body});
  if(path==='git/ref/heads/main')return route.fulfill({json:{object:{sha:ref}}});
  if(path==='git/commits/'+ref)return route.fulfill({json:{tree:{sha:'base-tree'}}});
  if(path==='contents/config/gauges.json?ref='+ref)return route.fulfill({json:{content:Buffer.from(JSON.stringify(configs)).toString('base64')}});
  if(path==='git/blobs'){const sha='blob-'+blobs.size;blobs.set(sha,Buffer.from(body.content,'base64'));return route.fulfill({json:{sha}});}
  if(path==='git/trees'){trees=body.tree;return route.fulfill({json:{sha:'tree'}});}
  if(path==='git/commits'){assert.deepEqual(body.parents,[ref]);return route.fulfill({json:{sha:'new-head'}});}
  if(path==='git/refs/heads/main'){
   assert.equal(body.force,false);
   if(rejectUpdate)return route.fulfill({status:422,json:{message:'Conflict'}});
   configs=JSON.parse(blobs.get(trees.find(x=>x.path==='config/gauges.json').sha));
   for(const t of trees.filter(x=>x.path.startsWith('docs/assets/')))uploadedAssets.set(t.path.slice(5),blobs.get(t.sha));
   ref=body.sha;return route.fulfill({json:{object:{sha:ref}}});
  }
  throw Error('Unexpected path: '+path);
 });
 await page.goto('http://localhost:8099/settings.html');
 await page.waitForFunction(()=>document.querySelector('#cameraImage').naturalWidth===125);
 await page.locator('#imageFile').setInputFiles('.local/upload-demo.png');
 await page.locator('#demoImageStatus').filter({hasText:'未保存'}).waitFor();
 assert.equal(await page.locator('#cameraImage').evaluate(x=>x.naturalWidth),250);
 await page.locator('#githubToken').fill('mock-token');
 await page.locator('#publish').click();
 await page.locator('#status').filter({hasText:'422'}).waitFor();
 assert.equal(ref,'head0');assert.equal(configs[0].demo_image,undefined);
 await page.locator('#publish').click();
 // Second attempt is also rejected, proving the pending image remains available.
 await page.locator('#publish:not([disabled])').waitFor();
 assert.equal(ref,'head0');rejectUpdate=false;
 await page.locator('#publish').click();
 await page.locator('#status').filter({hasText:'選択画像と校正設定を同じcommit'}).waitFor();
 assert.match(configs[0].demo_image,/^assets\/demo-images\/[a-f0-9]{64}\.png$/);
 assert.deepEqual(configs[0].image_size,[250,180]);
 assert.equal(trees.length,2);
 assert.ok(uploadedAssets.get(configs[0].demo_image).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
 assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes('mock-token'));
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#cameraImage').naturalWidth===250);
 assert.ok((await page.locator('#cameraImage').getAttribute('src')).includes(configs[0].demo_image));
 assert.match(await page.locator('#demoImageStatus').innerText(),/保存済みの専用デモ/);
 await page.locator('#demoImage').click();
 await page.waitForFunction(()=>document.querySelector('#cameraImage').naturalWidth===250);
 await page.screenshot({path:'.local/demo-reloaded-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'.local/demo-reloaded-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.route('**/data/latest.json*',r=>r.fulfill({json:{schema_version:1,generated_at:new Date().toISOString(),readings:[{...configs[0],status:'normal',value:75,updated_at:new Date().toISOString(),confidence:.9}]}}));
 await page.goto('http://localhost:8099/');
 await page.locator('.preview').waitFor();
 assert.ok((await page.locator('.preview').getAttribute('src')).includes(configs[0].demo_image));
 assert.equal(await page.locator('.preview').evaluate(x=>x.naturalWidth),250);
 assert.deepEqual(errors,[]);
 console.log('Demo image browser checks passed: upload, failed atomic save/retry, successful single commit, reload, saved demo button, dashboard and mobile.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
