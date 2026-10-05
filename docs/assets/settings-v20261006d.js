import {pointKeys,perspectiveKeys,fields,numeric,geometry,validate,validateAll,analyzeImageData} from './calibration.mjs?v=20261006-1';
const $=id=>document.getElementById(id),say=t=>$('status').textContent=t;
const repo='MOSA-github/fuel_level_monitoring_system',key='mosa-gauge-draft-v1';
const baselines=new Map();
let configs=[],current=null,selected='min',base=null,baseId=null,objectUrl=null,testNeedlePoint=null,testState=null;
const names={min:'① 最小目盛',center:'② 針の回転中心',max:'③ 最大目盛'};
const warpNames={tl:'左上',tr:'右上',br:'右下',bl:'左下'};
const colors={min:'#1bc6b2',center:'#ffffff',max:'#ffa948'};
const blank=()=>({id:'gauge-'+Date.now(),camera_id:'1',facility_id:'',device_id:'',name:'新しい計器',type:'water',unit:'%',min_value:0,max_value:100,direction:'cw',interval_minutes:60,enabled:false,is_demo:false,polarity:'dark',min_confidence:.35,inner_radius:.30,outer_radius:.72,perspective_enabled:false,perspective_points:{},points:{},image_size:[]});
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const checkFields=['enabled','is_demo','perspective_enabled'];
const fieldLabels={id:'設定ID',camera_id:'カメラID',facility_id:'施設ID',device_id:'設備ID',name:'名称',unit:'単位',min_value:'① 最小値',max_value:'③ 最大値',interval_minutes:'実行間隔',min_confidence:'最低信頼度',inner_radius:'検出開始半径',outer_radius:'検出終了半径'};
function invalidMessage(el){const label=fieldLabels[el.id]||el.id||'入力欄';const v=el.validity;if(v.valueMissing)return `「${label}」が未入力です。`;if(v.patternMismatch)return `「${label}」は英数字・ハイフン（-）・_ だけで入力してください。`;if(v.rangeUnderflow)return `「${label}」は ${el.min} 以上にしてください。`;if(v.rangeOverflow)return `「${label}」は ${el.max} 以下にしてください。`;if(v.stepMismatch)return `「${label}」の値 ${el.value} が入力刻みに合っていません。`;if(v.badInput)return `「${label}」を数値で入力してください。`;return `「${label}」を確認してください。`;}
function firstInvalid(){const form=$('settingsForm');const el=form.querySelector(':invalid');if(!el)return null;const details=el.closest('details');if(details)details.open=true;document.querySelectorAll('.field-invalid').forEach(x=>x.classList.remove('field-invalid'));el.classList.add('field-invalid');el.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>el.focus({preventScroll:true}),250);return invalidMessage(el);}
function read(){for(const k of fields)current[k]=checkFields.includes(k)?$(k).checked:numeric.includes(k)?($(k).value===''?NaN:Number($(k).value)):$(k).value.trim();return current;}
function clearTest(message='未実行'){testNeedlePoint=null;testState=null;if($('testResult')){$('testResult').className='test-result';$('testResult').textContent=message;}}
function fill(c){current=structuredClone(c);current.perspective_enabled=!!current.perspective_enabled;current.perspective_points=current.perspective_points||{};for(const k of fields){if(checkFields.includes(k))$(k).checked=!!current[k];else $(k).value=current[k]??'';}selected='min';clearTest();draw();}
function choices(id){$('gaugeSelect').replaceChildren(...configs.map(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name+' / '+c.id;return o}));$('gaugeSelect').value=id;}
async function image(src){return new Promise((resolve,reject)=>{const im=$('cameraImage');im.onload=()=>{current.image_size=[im.naturalWidth,im.naturalHeight];$('imageSize').textContent=im.naturalWidth+' × '+im.naturalHeight;if(current.perspective_enabled&&!Object.keys(current.perspective_points||{}).length)current.perspective_points={tl:[0,0],tr:[1,0],br:[1,1],bl:[0,1]};clearTest();draw();resolve();};im.onerror=()=>{im.removeAttribute('src');say('画像を取得できません。URL・認証またはファイル形式を確認してください。');reject(Error('画像取得失敗'));};im.src=src;});}
async function select(id){const c=configs.find(x=>x.id===id);if(!c)return;base=baselines.get(c.id)||null;baseId=base?c.id:null;fill(c);$('imageUrl').value='';if(c.is_demo)await image('assets/demo-meter.png');else{$('cameraImage').removeAttribute('src');$('imageSize').textContent='カメラ画像を読み込んでください';}}
function draw(){
const c=current,p=c.points||{},pp=c.perspective_points||{},[w,h]=c.image_size?.length===2?c.image_size:[1000,700],svg=$('overlay'),radius=Math.max(w,h)*.016,font=radius*1.7;
svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.replaceChildren();
const add=(tag,attrs,text)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);if(text)el.textContent=text;svg.append(el);return el;};
if(c.perspective_enabled){
  const ordered=perspectiveKeys.filter(k=>pp[k]);
  if(ordered.length===4){const pts=perspectiveKeys.map(k=>`${pp[k][0]*w},${pp[k][1]*h}`).join(' ');add('polygon',{points:pts,fill:'#a95cf4','fill-opacity':'.09',stroke:'#7b2cbf','stroke-width':radius*.42,'stroke-dasharray':radius*.6});}
  else if(ordered.length>=2){const pts=ordered.map(k=>`${pp[k][0]*w},${pp[k][1]*h}`).join(' ');add('polyline',{points:pts,fill:'none',stroke:'#7b2cbf','stroke-width':radius*.42,'stroke-dasharray':radius*.6});}
  for(const k of perspectiveKeys)if(pp[k]){const x=pp[k][0]*w,y=pp[k][1]*h,lx=Math.min(w-radius*2,Math.max(radius*2,x)),ly=Math.min(h-radius*1.4,Math.max(radius*2.2,y+font*.3));add('circle',{cx:x,cy:y,r:radius*1.05,fill:'#efe2ff',stroke:'#5a189a','stroke-width':radius*.25});add('text',{x:lx,y:ly,'text-anchor':'middle','font-size':font*.68,fill:'#5a189a','font-weight':'bold'},warpNames[k]);}
}
if(p.center)for(const k of ['min','max'])if(p[k])add('line',{x1:p.center[0]*w,y1:p.center[1]*h,x2:p[k][0]*w,y2:p[k][1]*h,stroke:colors[k],'stroke-width':radius*.2,'stroke-dasharray':radius*.5});
for(const k of pointKeys)if(p[k]){add('circle',{cx:p[k][0]*w,cy:p[k][1]*h,r:radius,fill:colors[k],stroke:'#163c30','stroke-width':radius*.12});add('text',{x:p[k][0]*w,y:p[k][1]*h+font*.33,'text-anchor':'middle','font-size':font,fill:'#163c30','font-weight':'bold'},String(pointKeys.indexOf(k)+1));}
if(testNeedlePoint&&p.center){const bad=testState!=='normal';add('line',{x1:p.center[0]*w,y1:p.center[1]*h,x2:testNeedlePoint[0]*w,y2:testNeedlePoint[1]*h,stroke:bad?'#d53d3d':'#e83e8c','stroke-width':radius*.38,'stroke-linecap':'round','stroke-dasharray':bad?radius*.6:'none'});add('circle',{cx:testNeedlePoint[0]*w,cy:testNeedlePoint[1]*h,r:radius*.65,fill:bad?'#ffdada':'#ffb3d1',stroke:bad?'#b42318':'#a51d5d','stroke-width':radius*.14});}
$('pointList').textContent=pointKeys.map(k=>names[k]+': '+(p[k]?p[k].map(v=>v.toFixed(3)).join(', '):'未指定')).join(' / ');
$('perspectiveList').textContent=perspectiveKeys.map(k=>warpNames[k]+': '+(pp[k]?pp[k].map(v=>v.toFixed(3)).join(', '):'未指定')).join(' / ');
const pCount=perspectiveKeys.filter(k=>pp[k]).length;if($('perspectiveStatus')){$('perspectiveStatus').className='source-status '+(c.perspective_enabled?(pCount===4?'ok':'warn'):'off');$('perspectiveStatus').innerHTML=!c.perspective_enabled?'<strong>台形補正：OFF</strong>（正面撮影ならこのままでOK）':pCount===4?'<strong>台形補正：ON / 4点設定済み</strong>。紫の四角形が補正対象です。各ボタンを押して画像上をクリックすると調整できます。':'<strong>台形補正：ON / 4点未完了</strong>。左上 → 右上 → 右下 → 左下を指定してください。';}
if($('productionSourceStatus')){const cam=String(c.camera_id||'').replace(/[<>&"']/g,'');if(c.is_demo){$('productionSourceStatus').className='source-status warn';$('productionSourceStatus').innerHTML='<strong>現在の本番ソース：固定デモ画像</strong><br>この状態では自動更新時に実カメラを参照しません。実運用ではこのチェックを外してください。';}else{$('productionSourceStatus').className='source-status ok';$('productionSourceStatus').innerHTML='<strong>現在の本番ソース：実カメラ</strong><br>自動更新時は camera_id = <code>'+cam+'</code> をキーに、GitHub Actions Secret <code>CAMERA_SOURCES_JSON</code> からURLを取得し、その時点の最新JPEGを解析します。上のテスト表示用URLは使いません。';}}
if($('publishReadiness')){const pts=pointKeys.every(k=>Array.isArray(c.points?.[k]));const persp=!c.perspective_enabled||perspectiveKeys.every(k=>Array.isArray(c.perspective_points?.[k]));const imageOk=Array.isArray(c.image_size)&&c.image_size.length===2;const source=c.is_demo?'固定デモ画像':`実カメラ ID ${String(c.camera_id||'—')}`;$('publishReadiness').innerHTML=`<div class="ready-row ${imageOk&&pts&&persp?'ok':'warn'}"><strong>${imageOk&&pts&&persp?'✓':'!'} 校正</strong><span>${imageOk&&pts&&persp?'①〜③'+(c.perspective_enabled?'・台形補正4点':'')+' 設定済み':'画像・①〜③'+(c.perspective_enabled?'・台形補正4点':'')+'を確認'}</span></div><div class="ready-row ok"><strong>本番画像</strong><span>${source}</span></div>`;}
if($('secretExample')){const cam=String(c.camera_id||'1').replace(/[<>&"']/g,'');$('secretExample').innerHTML=c.is_demo?'現在は固定デモ画像なのでSecretは使いません。':`現在のカメラIDは <code>${cam}</code> です。Secret例：<code>{"${cam}":"https://camera.mosademy.tech/camera/latest/${cam}?token=..."}</code>`;}
$('perspectiveControls').classList.toggle('disabled-controls',!c.perspective_enabled);
$('coordinateFields').replaceChildren();
for(const k of pointKeys)for(let axis=0;axis<2;axis++){const l=document.createElement('label');l.textContent=names[k]+' '+['X','Y'][axis];const i=document.createElement('input');Object.assign(i,{type:'number',min:'0',max:'1',step:'any',value:p[k]?.[axis]??''});i.onchange=()=>{const pair=[...(p[k]||[.5,.5])];pair[axis]=Number(i.value);current.points[k]=pair;clearTest();draw();};l.append(i);$('coordinateFields').append(l);}
document.querySelectorAll('[data-point]').forEach(b=>b.classList.toggle('active',b.dataset.point===selected));
document.querySelectorAll('[data-warp]').forEach(b=>b.classList.toggle('active',b.dataset.warp===selected));
try{const vc=validate(c);const {span,space}=geometry(vc);$('previewValue').textContent='自動検出';$('angleInfo').textContent='校正範囲 '+(span*180/Math.PI).toFixed(1)+'°'+(vc.perspective_enabled?' / 台形補正後 '+space.width+'×'+space.height+' px':'')+'。針は各更新画像から自動検出します。';}catch(e){$('previewValue').textContent='—';$('angleInfo').textContent=e.message;}
}
function upsert(){read();const bad=firstInvalid();if(bad)throw Error(bad);let c;try{c=validate(current);}catch(err){throw Error('設定を確認してください：'+(err?.message||'入力内容が不正です。'));}if(baseId&&c.id!==baseId)throw Error('既存の設定IDは変更できません。新しい計器として登録してください。');const next=configs.filter(x=>x.id!==c.id);next.push(c);configs=validateAll(next);current=structuredClone(c);choices(c.id);return c;}
function safe(fn){return async e=>{try{await fn(e);}catch(err){say(err.message||'操作に失敗しました。');}};}
$('overlay').onclick=e=>{const im=$('cameraImage');if(!im.complete||!im.naturalWidth)return;const box=e.currentTarget.getBoundingClientRect(),pair=[(e.clientX-box.left)/box.width,(e.clientY-box.top)/box.height];if(perspectiveKeys.includes(selected)){if(!current.perspective_enabled)return;current.perspective_points=current.perspective_points||{};current.perspective_points[selected]=pair;selected=perspectiveKeys[Math.min(perspectiveKeys.length-1,perspectiveKeys.indexOf(selected)+1)];}else{current.points[selected]=pair;selected=pointKeys[Math.min(pointKeys.length-1,pointKeys.indexOf(selected)+1)];}clearTest();read();draw();};
document.querySelectorAll('[data-point]').forEach(b=>b.onclick=()=>{selected=b.dataset.point;draw();});
document.querySelectorAll('[data-warp]').forEach(b=>b.onclick=()=>{if(!current.perspective_enabled){current.perspective_enabled=true;$('perspective_enabled').checked=true;}selected=b.dataset.warp;clearTest();draw();});
for(const k of fields)$(k).oninput=()=>{read();clearTest();draw();};
$('perspective_enabled').onchange=()=>{read();if(current.perspective_enabled&&!Object.keys(current.perspective_points||{}).length&&current.image_size?.length===2)current.perspective_points={tl:[0,0],tr:[1,0],br:[1,1],bl:[0,1]};selected=current.perspective_enabled?'tl':'min';clearTest();draw();};
$('perspectiveFullFrame').onclick=()=>{current.perspective_enabled=true;$('perspective_enabled').checked=true;current.perspective_points={tl:[0,0],tr:[1,0],br:[1,1],bl:[0,1]};selected='tl';clearTest();draw();};
$('clearPerspective').onclick=()=>{current.perspective_points={};selected='tl';clearTest();draw();};
$('gaugeSelect').onchange=safe(()=>select($('gaugeSelect').value));
$('newGauge').onclick=()=>{base=null;baseId=null;fill(blank());$('gaugeSelect').value='';$('cameraImage').removeAttribute('src');$('imageSize').textContent='カメラ画像を読み込んでください';};
$('imageFile').onchange=safe(async()=>{const f=$('imageFile').files[0];if(!f)return;if(f.size>10*1024*1024)throw Error('画像は10MB以下にしてください。');if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(f);await image(objectUrl);});
$('demoImage').onclick=safe(async()=>{if(!current.is_demo)throw Error('動画サンプルは「検証用の固定画像を使う」を有効にして利用してください。');await image('assets/demo-meter.png');});
$('loadCamera').onclick=safe(async()=>{const u=new URL($('imageUrl').value);if(u.protocol!=='https:'||u.hostname!=='camera.mosademy.tech'||u.username||u.password||!/^\/camera\/latest\/[A-Za-z0-9_-]+$/.test(u.pathname))throw Error('許可されたカメラ最新JPEG URLを指定してください。');await image(u.href);say('カメラ最新画像をテスト表示しました。このURLは本番設定には保存されません。自動更新は camera_id と CAMERA_SOURCES_JSON を使用します。');});
async function runInstantAnalysis(){
  const button=$('analyzeTest'),resultBox=$('testResult');
  button.disabled=true;
  resultBox.className='test-result running';
  resultBox.textContent='クリックを受け付けました。設定を確認中…';
  // 先に画面へ状態を描画してから重い画像解析へ進む。
  await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
  try{
    const im=$('cameraImage');
    if(!im.complete||!im.naturalWidth)throw Error('先にテストする画像を読み込んでください。');
    read();
    const c=validate(current),canvas=$('analysisCanvas');
    canvas.width=im.naturalWidth;canvas.height=im.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw Error('ブラウザで解析用Canvasを初期化できませんでした。ページを再読み込みしてください。');
    ctx.drawImage(im,0,0);
    resultBox.textContent='画像を読み取り、針を解析中…';
    await new Promise(r=>setTimeout(r,0));
    let pixels;
    try{pixels=ctx.getImageData(0,0,canvas.width,canvas.height);}
    catch(e){throw Error('このカメラ画像はブラウザのCORS制限で直接解析できません。画像を保存し、「画像ファイルを選ぶ」から読み込んでテストしてください。');}
    const result=analyzeImageData(pixels,c);
    testNeedlePoint=result.needle_point;testState=result.status;draw();
    if(result.status==='normal'){
      resultBox.className='test-result success';
      resultBox.innerHTML=`<strong>${result.value} ${c.unit}</strong>（${result.percent}%） / 信頼度 ${result.confidence.toFixed(4)}<br><span>ピンク線が自動認識した針です。この結果は保存されません。</span>`;
      say('針の解析テストが完了しました。GitHubへの保存はまだ行っていません。');
    }else{
      resultBox.className='test-result error';
      resultBox.innerHTML=`<strong>認識NG</strong> / 信頼度 ${result.confidence.toFixed(4)}<br><span>赤い破線は最有力候補です。①〜③、台形補正、針の色、検出半径を確認してください。</span>`;
      say('針候補は検出しましたが、信頼度条件を満たしませんでした。');
    }
  }catch(err){
    testNeedlePoint=null;testState=null;draw();
    const message=err?.message||'解析テストに失敗しました。';
    resultBox.className='test-result error';
    resultBox.replaceChildren();
    const strong=document.createElement('strong');strong.textContent='解析できません';
    const br=document.createElement('br');
    const span=document.createElement('span');span.textContent=message;
    resultBox.append(strong,br,span);
    say('針の解析テスト：'+message);
  }finally{
    button.disabled=false;
  }
}
$('analyzeTest').addEventListener('click',runInstantAnalysis);
$('testResult').textContent='準備完了（クリックで即時解析できます）';
$('analyzeTest').dataset.handlerReady='true';
$('settingsForm').onsubmit=safe(e=>{e.preventDefault();upsert();localStorage.setItem(key,JSON.stringify(configs));say('このブラウザに下書きを保存しました。本番にはまだ反映されていません。GitHubへ設定を反映するか、JSONをcommit・pushしてください。');});
$('restore').onclick=safe(async()=>{const raw=localStorage.getItem(key);if(!raw)throw Error('保存済みの下書きはありません。');configs=validateAll(JSON.parse(raw));choices(configs[0]?.id);if(configs.length){base=baselines.get(configs[0].id)||null;baseId=base?base.id:null;fill(configs[0]);if(current.is_demo)await image('assets/demo-meter.png');}say('下書きを復元しました。これはブラウザ内の下書きです。本番反映にはGitHubへの保存が必要です。');});
$('export').onclick=safe(()=>{upsert();const url=URL.createObjectURL(new Blob([JSON.stringify(configs,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='gauges.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('gauges.jsonを書き出しました。手動方式では、これを config/gauges.json に反映してcommit・pushしてください。');});
$('import').onchange=safe(async()=>{const f=$('import').files[0];if(!f)return;if(f.size>1000000)throw Error('JSONが大きすぎます。');configs=validateAll(JSON.parse(await f.text()));choices(configs[0]?.id);base=baselines.get(configs[0]?.id)||null;baseId=base?base.id:null;$('cameraImage').removeAttribute('src');if(configs.length)fill(configs[0]);say('設定を読み込みました。GitHubへは現在選択中の1件だけを反映します。');});
async function api(path,method='GET',body){const token=$('githubToken').value.trim();if(!token)throw Error('GitHubトークンを入力してください。');const r=await fetch('https://api.github.com/repos/'+repo+'/'+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('GitHub API '+r.status+'：権限・同時更新・Actions設定を確認してください。');return r.status===204?null:r.json();}
$('publish').onclick=safe(async()=>{const c=upsert();$('publish').disabled=true;try{const file=await api('contents/config/gauges.json?ref=main');const remote=validateAll(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),ch=>ch.charCodeAt(0)))));const existing=remote.find(x=>x.id===c.id);if(existing&&(!base||!equal(existing,validate(base))))throw Error('公開設定が別の操作で更新されています。下書きを書き出し、ページを再読み込みして変更を確認してください。');if(base&&!existing)throw Error('この設定は削除されています。再読込してください。');const merged=validateAll([...remote.filter(x=>x.id!==c.id),c]);const bytes=new TextEncoder().encode(JSON.stringify(merged,null,2)+'\n');let binary='';for(const b of bytes)binary+=String.fromCharCode(b);await api('contents/config/gauges.json','PUT',{message:'Update gauge calibration: '+c.id,branch:'main',sha:file.sha,content:btoa(binary)});configs=merged;base=structuredClone(c);baselines.set(c.id,base);baseId=c.id;choices(c.id);say('本番反映が完了しました。mainへのcommitまで自動実行済みです。GitHub Actionsが起動し、この設定で解析・公開します。別途commitは不要です。');}finally{$('publish').disabled=false;}});
$('run').onclick=safe(async()=>{await api('actions/workflows/monitor.yml/dispatches','POST',{ref:'main',inputs:{force:'true'}});say('GitHubに保存済みの設定で即時解析を依頼しました。画面上の未保存変更は使われません。Actionsで実行状況を確認できます。');});
$('githubToken').oninput=()=>{document.querySelectorAll('.field-invalid').forEach(x=>x.classList.remove('field-invalid'));};
$('clearToken').onclick=()=>{$('githubToken').value='';say('トークンを消去しました。');};
window.addEventListener('pagehide',()=>{$('githubToken').value='';$('imageUrl').value='';});
try{const r=await fetch('data/gauges.json?t='+Date.now());if(!r.ok)throw Error('設定の読込に失敗しました。');configs=validateAll(await r.json());configs.forEach(c=>baselines.set(c.id,structuredClone(c)));choices(new URLSearchParams(location.search).get('id')||configs[0]?.id);const q=new URLSearchParams(location.search);if(q.has('camera_id')){const c=blank();c.camera_id=q.get('camera_id');c.facility_id=q.get('facility_id')||'';fill(c);$('gaugeSelect').value='';}else if(configs.length)await select($('gaugeSelect').value||configs[0].id);else fill(blank());}catch(e){fill(blank());say(e.message);}
