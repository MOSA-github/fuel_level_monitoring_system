const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let configs=JSON.parse(fs.readFileSync('tests/fixtures/demo.json','utf8')),configBytes,tree;
 await page.route('**/data/gauges.json*',r=>r.fulfill({json:configs}));
 await page.route('https://api.github.com/repos/MOSA-github/fuel_level_monitoring_system/**',async r=>{
  const request=r.request(),path=request.url().split('/fuel_level_monitoring_system/')[1],body=request.postDataJSON();
  if(path==='git/ref/heads/main')return r.fulfill({json:{object:{sha:'head'}}});
  if(path==='git/commits/head')return r.fulfill({json:{tree:{sha:'base-tree'}}});
  if(path==='contents/config/gauges.json?ref=head')return r.fulfill({json:{content:Buffer.from(JSON.stringify(configs)).toString('base64')}});
  if(path==='git/blobs'){configBytes=Buffer.from(body.content,'base64');return r.fulfill({json:{sha:'config-blob'}});}
  if(path==='git/trees'){tree=body.tree;return r.fulfill({json:{sha:'new-tree'}});}
  if(path==='git/commits')return r.fulfill({json:{sha:'new-head'}});
  if(path==='git/refs/heads/main'){assert.equal(body.force,false);configs=JSON.parse(configBytes);return r.fulfill({json:{object:{sha:'new-head'}}});}
  throw Error('Unexpected API '+path);
 });
 const base=process.env.GAUGE_TEST_URL||'http://localhost:8099/';
 await page.goto(base+'settings.html');
 await page.waitForFunction(()=>document.querySelector('#cameraImage').naturalWidth===125);
 await page.locator('#type').selectOption('power');
 assert.equal(await page.locator('#unit').inputValue(),'W');
 await page.locator('#unit').fill('kW');
 await page.locator('#name').fill('\u96fb\u529b\u8a08');
 await page.locator('#analyzeTest').click();
 await page.locator('#testResult.success').waitFor();
 assert.match(await page.locator('#testResult strong').innerText(),/^\d+\.\d kW$/);
 await page.locator('#githubToken').fill('mock-token');
 await page.locator('#publish').click();
 await page.locator('#status').filter({hasText:'\u672c\u756a\u53cd\u6620\u304c\u5b8c\u4e86'}).waitFor();
 assert.equal(tree.length,1);assert.equal(configs[0].type,'power');assert.equal(configs[0].unit,'kW');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#cameraImage').naturalWidth===125);
 assert.equal(await page.locator('#type').inputValue(),'power');assert.equal(await page.locator('#unit').inputValue(),'kW');
 await page.route('**/data/latest.json*',r=>r.fulfill({json:{schema_version:1,generated_at:new Date().toISOString(),readings:[{...configs[0],value:250.1,status:'normal',confidence:.9,updated_at:new Date().toISOString(),attempted_at:new Date().toISOString()}]}}));
 await page.goto(base);await page.locator('.reading').waitFor();
 assert.match(await page.locator('.reading').innerText(),/\u96fb\u529b/);assert.match(await page.locator('.value').innerText(),/250.1kW/);
 assert.deepEqual(errors,[]);
 console.log('Power browser checks passed: selection, W default, custom kW, instant analysis, GitHub save, reload and results.');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
