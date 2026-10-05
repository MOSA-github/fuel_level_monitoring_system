export const pointKeys=['min','center','max'];
export const perspectiveKeys=['tl','tr','br','bl'];
export const fields=['id','camera_id','facility_id','device_id','name','type','unit','min_value','max_value','direction','interval_minutes','enabled','is_demo','polarity','min_confidence','inner_radius','outer_radius','perspective_enabled'];
export const numeric=['min_value','max_value','interval_minutes','min_confidence','inner_radius','outer_radius'];

const finitePoint=p=>Array.isArray(p)&&p.length===2&&p.every(x=>Number.isFinite(x)&&x>=0&&x<=1);
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

function solveLinear(A,b){
  const n=b.length,M=A.map((row,i)=>[...row,b[i]]);
  for(let col=0;col<n;col++){
    let pivot=col;
    for(let r=col+1;r<n;r++)if(Math.abs(M[r][col])>Math.abs(M[pivot][col]))pivot=r;
    if(Math.abs(M[pivot][col])<1e-10)throw Error('台形補正の4点が不正です。四隅を離して指定してください。');
    [M[col],M[pivot]]=[M[pivot],M[col]];
    const d=M[col][col];for(let j=col;j<=n;j++)M[col][j]/=d;
    for(let r=0;r<n;r++)if(r!==col){const f=M[r][col];if(f===0)continue;for(let j=col;j<=n;j++)M[r][j]-=f*M[col][j];}
  }
  return M.map(row=>row[n]);
}

export function homography(src,dst){
  const A=[],b=[];
  for(let i=0;i<4;i++){
    const [x,y]=src[i],[u,v]=dst[i];
    A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);
    A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);
  }
  const h=solveLinear(A,b);
  return [h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1];
}

export function transformPoint(H,p){
  const [x,y]=p,d=H[6]*x+H[7]*y+H[8];
  if(Math.abs(d)<1e-12)throw Error('台形補正の変換に失敗しました。');
  return [(H[0]*x+H[1]*y+H[2])/d,(H[3]*x+H[4]*y+H[5])/d];
}

function polygonArea(ps){let a=0;for(let i=0;i<ps.length;i++){const p=ps[i],q=ps[(i+1)%ps.length];a+=p[0]*q[1]-q[0]*p[1];}return Math.abs(a)/2;}

export function perspectiveModel(c){
  if(!c.perspective_enabled)return null;
  const [w,h]=c.image_size;
  const pp=c.perspective_points||{};
  for(const k of perspectiveKeys)if(!finitePoint(pp[k]))throw Error('台形補正の左上・右上・右下・左下を指定してください。');
  const src=perspectiveKeys.map(k=>[pp[k][0]*(w-1),pp[k][1]*(h-1)]);
  if(polygonArea(src)<w*h*.005)throw Error('台形補正の範囲が小さすぎます。');
  const top=dist(src[0],src[1]),bottom=dist(src[3],src[2]),left=dist(src[0],src[3]),right=dist(src[1],src[2]);
  const outW=Math.max(16,Math.round(Math.max(top,bottom))+1),outH=Math.max(16,Math.round(Math.max(left,right))+1);
  if(outW>12000||outH>12000)throw Error('台形補正後の画像サイズが大きすぎます。');
  const dst=[[0,0],[outW-1,0],[outW-1,outH-1],[0,outH-1]];
  return {src,dst,width:outW,height:outH,H:homography(src,dst),inverse:homography(dst,src)};
}

export function detectionSpace(c){
  const model=perspectiveModel(c);
  if(!model)return {width:c.image_size[0],height:c.image_size[1],points:c.points,model:null};
  const points={};
  for(const k of [...pointKeys,'reference'])if(finitePoint(c.points?.[k])){
    const raw=[c.points[k][0]*(c.image_size[0]-1),c.points[k][1]*(c.image_size[1]-1)];
    const q=transformPoint(model.H,raw);points[k]=[q[0]/(model.width-1),q[1]/(model.height-1)];
  }
  return {width:model.width,height:model.height,points,model};
}

export function geometry(c){
  const s=detectionSpace(c),p=s.points,sign=c.direction==='cw'?1:-1,tau=Math.PI*2;
  const angle=k=>Math.atan2((p[k][1]-p.center[1])*s.height,(p[k][0]-p.center[0])*s.width);
  const start=angle('min'),norm=x=>((x%tau)+tau)%tau;
  return {start,span:norm((angle('max')-start)*sign),space:s};
}

export function validate(c){
  c=structuredClone(c);
  if(c.perspective_enabled===undefined)c.perspective_enabled=false;
  if(c.perspective_points===undefined)c.perspective_points={};
  for(const k of ['id','camera_id','facility_id','device_id'])if(!/^[A-Za-z0-9_-]{1,80}$/.test(c[k]||''))throw Error(k+' は英数字・ハイフン・_で入力してください。');
  if(!['water','fuel','generator'].includes(c.type)||!['cw','ccw'].includes(c.direction)||!['dark','light'].includes(c.polarity))throw Error('種別・回転方向・針の色が不正です。');
  if(typeof c.enabled!=='boolean'||typeof c.is_demo!=='boolean'||typeof c.perspective_enabled!=='boolean')throw Error('有効・検証用・台形補正フラグが不正です。');
  if(!c.name||c.name.length>120||!c.unit||c.unit.length>20)throw Error('名称・単位を入力してください。');
  for(const k of numeric)if(!Number.isFinite(c[k]))throw Error(k+' を数値で入力してください。');
  if(!Number.isInteger(c.interval_minutes)||c.interval_minutes<5||c.interval_minutes>10080)throw Error('間隔は5〜10080分の整数です。');
  if(c.max_value<=c.min_value||c.min_confidence<0||c.min_confidence>1||c.inner_radius<.1||c.inner_radius>=c.outer_radius||c.outer_radius>1.3)throw Error('換算範囲・信頼度・検出半径を確認してください。');
  if(!Array.isArray(c.image_size)||c.image_size.length!==2||c.image_size.some(x=>!Number.isInteger(x)||x<16||x>12000))throw Error('基準画像を読み込んでください。');
  for(const k of pointKeys){const p=c.points?.[k];if(!finitePoint(p))throw Error('①〜③の基準点を指定してください。');}
  for(const k of ['min','max'])if(Math.hypot(c.points[k][0]-c.points.center[0],c.points[k][1]-c.points.center[1])<.02)throw Error('基準点が針の中心に近すぎます。');
  const cleanPerspective={};
  for(const k of perspectiveKeys)if(finitePoint(c.perspective_points?.[k]))cleanPerspective[k]=structuredClone(c.perspective_points[k]);
  c.perspective_points=cleanPerspective;
  if(c.perspective_enabled)perspectiveModel(c);
  const {span}=geometry(c);if(span<5*Math.PI/180||span>350*Math.PI/180)throw Error('回転方向と①③の位置を確認してください。');
  const points=Object.fromEntries(pointKeys.map(k=>[k,structuredClone(c.points[k])]));
  if(finitePoint(c.points?.reference))points.reference=structuredClone(c.points.reference);
  return Object.fromEntries([...fields].map(k=>[k,structuredClone(c[k])]).concat([['points',points],['image_size',structuredClone(c.image_size)],['perspective_points',cleanPerspective]]));
}

export function validateAll(cs){if(!Array.isArray(cs)||cs.length>100)throw Error('設定は100件以下の配列にしてください。');const ids=new Set(),targets=new Set();return cs.map(c=>{c=validate(c);const target=c.facility_id+'/'+c.device_id;if(ids.has(c.id)||targets.has(target))throw Error('設定IDまたは施設・設備IDが重複しています。');ids.add(c.id);targets.add(target);return c;});}

function grayAt(data,w,h,x,y){
  if(x<0||x>w-1||y<0||y>h-1)throw Error('検出領域が画像外に出ています。①〜③または検出半径を調整してください。');
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),fx=x-x0,fy=y-y0;
  const g=(xx,yy)=>{const i=(yy*w+xx)*4;return .299*data[i]+.587*data[i+1]+.114*data[i+2];};
  const a=g(x0,y0)*(1-fx)+g(x1,y0)*fx,b=g(x0,y1)*(1-fx)+g(x1,y1)*fx;return a*(1-fy)+b*fy;
}

export function analyzeImageData(imageData,input){
  const c=validate(input),rawW=imageData.width,rawH=imageData.height;
  if(Math.abs(rawW/rawH-c.image_size[0]/c.image_size[1])>.015)throw Error('画像の縦横比が校正時から変わっています。再校正してください。');
  const {start,span,space}=geometry(c),p=space.points,model=space.model,sign=c.direction==='cw'?1:-1;
  const cx=p.center[0]*space.width,cy=p.center[1]*space.height;
  const radius=finitePoint(p.reference)?Math.hypot((p.reference[0]-p.center[0])*space.width,(p.reference[1]-p.center[1])*space.height):
    [p.min,p.max].map(q=>Math.hypot((q[0]-p.center[0])*space.width,(q[1]-p.center[1])*space.height)).sort((a,b)=>a-b).reduce((a,b)=>a+b,0)/2;
  const count=Math.max(121,Math.floor(span*180/Math.PI*3)),step=span/(count-1),flank=4*Math.PI/180;
  const sample=(a,r)=>{let q=[cx+Math.cos(a)*r,cy+Math.sin(a)*r];if(model)q=transformPoint(model.inverse,q);return grayAt(imageData.data,rawW,rawH,q[0],q[1]);};
  const scores=new Float64Array(count);
  for(let i=0;i<count;i++){
    const a=start+sign*step*i;let positive=0,strong=0;
    for(let j=0;j<100;j++){
      const r=radius*(c.inner_radius+(c.outer_radius-c.inner_radius)*j/99);
      const mid=sample(a,r),side=(sample(a+flank,r)+sample(a-flank,r))/2;
      const contrast=(side-mid)*(c.polarity==='dark'?1:-1);positive+=Math.max(contrast,0);if(contrast>4)strong++;
    }
    scores[i]=(positive/100)*(strong/100);
  }
  let best=0;for(let i=1;i<count;i++)if(scores[i]>scores[best])best=i;
  const bestOffset=step*best,peak=scores[best];let second=0;
  for(let i=0;i<count;i++)if(Math.abs(step*i-bestOffset)>9*Math.PI/180)second=Math.max(second,scores[i]);
  const confidence=Math.max(0,Math.min(1,(peak-second)/Math.max(peak,1)))*Math.min(1,peak/18),valid=confidence>=c.min_confidence&&peak>=4;
  const ratio=bestOffset/span,theta=start+sign*bestOffset;
  let tip=[cx+Math.cos(theta)*radius,cy+Math.sin(theta)*radius];if(model)tip=transformPoint(model.inverse,tip);
  return {status:valid?'normal':'error',value:valid?Math.round((c.min_value+ratio*(c.max_value-c.min_value))*1000)/1000:null,percent:valid?Math.round(ratio*10000)/100:null,confidence:Math.round(confidence*10000)/10000,needle_point:model?[tip[0]/(rawW-1),tip[1]/(rawH-1)]:[tip[0]/rawW,tip[1]/rawH],error:valid?null:'low_confidence'};
}
