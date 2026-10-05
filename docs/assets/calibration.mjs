export const pointKeys=['min','center','max','reference'];
export const fields=['id','camera_id','facility_id','device_id','name','type','unit','min_value','max_value','direction','interval_minutes','enabled','is_demo','polarity','min_confidence','inner_radius','outer_radius'];
export const numeric=['min_value','max_value','interval_minutes','min_confidence','inner_radius','outer_radius'];
export function geometry(c){const [w,h]=c.image_size,p=c.points,sign=c.direction==='cw'?1:-1,tau=Math.PI*2;const angle=k=>Math.atan2((p[k][1]-p.center[1])*h,(p[k][0]-p.center[0])*w);const start=angle('min'),norm=x=>((x%tau)+tau)%tau;return {start,span:norm((angle('max')-start)*sign),offset:norm((angle('reference')-start)*sign)}}
export function validate(c){
for(const k of ['id','camera_id','facility_id','device_id'])if(!/^[A-Za-z0-9_-]{1,80}$/.test(c[k]||''))throw Error(k+' は英数字・ハイフン・_で入力してください。');
if(!['water','generator'].includes(c.type)||!['cw','ccw'].includes(c.direction)||!['dark','light'].includes(c.polarity))throw Error('種別・回転方向・針の色が不正です。');
if(typeof c.enabled!=='boolean'||typeof c.is_demo!=='boolean')throw Error('有効・検証用フラグが不正です。');
if(!c.name||c.name.length>120||!c.unit||c.unit.length>20)throw Error('名称・単位を入力してください。');
for(const k of numeric)if(!Number.isFinite(c[k]))throw Error(k+' を数値で入力してください。');
if(!Number.isInteger(c.interval_minutes)||c.interval_minutes<5||c.interval_minutes>10080)throw Error('間隔は5〜10080分の整数です。');
if(c.max_value<=c.min_value||c.min_confidence<0||c.min_confidence>1||c.inner_radius<.1||c.inner_radius>=c.outer_radius||c.outer_radius>1.3)throw Error('換算範囲・信頼度・検出半径を確認してください。');
if(!Array.isArray(c.image_size)||c.image_size.length!==2||c.image_size.some(x=>!Number.isInteger(x)||x<16||x>12000))throw Error('基準画像を読み込んでください。');
for(const k of pointKeys){const p=c.points?.[k];if(!Array.isArray(p)||p.length!==2||p.some(x=>!Number.isFinite(x)||x<0||x>1))throw Error('①〜④の基準点を指定してください。');}
for(const k of ['min','max','reference'])if(Math.hypot(c.points[k][0]-c.points.center[0],c.points[k][1]-c.points.center[1])<.02)throw Error('基準点が針の中心に近すぎます。');
const {span,offset}=geometry(c);if(span<5*Math.PI/180||span>350*Math.PI/180||offset>span)throw Error('回転方向と①③④の順序を確認してください。');
return Object.fromEntries([...fields,'points','image_size'].map(k=>[k,structuredClone(c[k])]));
}
export function validateAll(cs){if(!Array.isArray(cs)||cs.length>100)throw Error('設定は100件以下の配列にしてください。');const ids=new Set(),targets=new Set();return cs.map(c=>{c=validate(c);const target=c.facility_id+'/'+c.device_id;if(ids.has(c.id)||targets.has(target))throw Error('設定IDまたは施設・設備IDが重複しています。');ids.add(c.id);targets.add(target);return c;});}
