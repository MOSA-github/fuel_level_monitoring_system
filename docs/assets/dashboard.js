import {demoImagePath,validDemoImagePath} from './demo-image.mjs';
import {readingStatus} from './reading-status.mjs';
const root=document.querySelector('#readings');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'未取得';
const history='https://github.com/MOSA-github/fuel_level_monitoring_system/actions/workflows/monitor.yml';
async function refresh(){
 try{
  const response=await fetch('data/latest.json?t='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error();
  const data=await response.json();
  document.querySelector('#updated').textContent='公開データ更新 '+time(data.generated_at)+'（JST）';
  document.querySelector('#lastChecked').textContent='このページの確認時刻 '+time(new Date().toISOString())+'（JST）';
  root.innerHTML=data.readings.map(x=>{
    const s=readingStatus(x);
    const warning=s.delayed||s.stale?'<p class="source-status warn"><strong>定期更新が遅れています</strong><br>最終解析から '+esc(s.ageMinutes??'不明')+' 分経過しています。設定は '+esc(x.interval_minutes)+' 分ですが、Actionsの定期起動が遅れる場合があります。<a href="'+history+'" target="_blank" rel="noopener">実行履歴を確認 ↗</a></p>':'';
    return `<article class="reading"><span class="badge ${s.tone}">${s.label}</span> ${x.is_demo?'<span class="badge demo">検証用・実測ではありません</span>':''}<h3>${esc(x.name)}</h3><div class="value">${s.valid?esc(x.value):'—'}<small>${esc(x.unit)}</small></div>
    <p class="hint">${x.is_demo?'固定デモ画像を再解析します。同じ画像・設定なら、更新しても数値は変わりません。':'カメラ画像から検出した針の角度による換算値'}</p>${warning}
    <div class="meta"><div><span>施設 / 設備</span>${esc(x.facility_id)} / ${esc(x.device_id)}</div><div><span>設定した解析間隔</span>${esc(x.interval_minutes)}分（Actionsの遅延あり）</div><div><span>最終解析時刻（JST）</span>${time(x.attempted_at||x.updated_at)}</div><div><span>最終成功時刻（JST）</span>${time(x.updated_at)}</div><div><span>信頼度（精度保証ではありません）</span>${Number.isFinite(x.confidence)?Math.round(x.confidence*100)+'%':'—'}</div></div>
    ${x.is_demo?'<img class="preview" src="'+esc(demoImagePath(validDemoImagePath(x.demo_image)?x:{}))+'" alt="保存済みの検証用計器画像">':''}<div class="toolbar"><a href="settings.html?id=${encodeURIComponent(x.id)}">設定・今すぐ解析 →</a><a href="${history}" target="_blank" rel="noopener">自動実行履歴 ↗</a></div></article>`;
  }).join('')||'<p>監視設定がありません。</p>';
 }catch{
  document.querySelector('#lastChecked').textContent='最新データの確認に失敗しました。';
  root.innerHTML='<p class="source-status warn">公開データを読み込めません。しばらくして再読み込みしてください。</p>';
 }
}
refresh();setInterval(refresh,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
