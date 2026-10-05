import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validate,validateAll,geometry,pointKeys,perspectiveModel,transformPoint} from '../docs/assets/calibration.mjs';
const c=JSON.parse(readFileSync(new URL('./fixtures/demo.json',import.meta.url)))[0];
test('valid demo uses exactly three required calibration points',()=>{const out=validate(c);assert.deepEqual(pointKeys,['min','center','max']);assert.equal(out.points.reference,undefined);assert.equal(out.perspective_enabled,false);const g=geometry(out);assert.ok(g.span>0);});
test('reject invalid intervals and nonfinite numbers',()=>{for(const v of [0,4,1.5,10081,NaN])assert.throws(()=>validate({...c,interval_minutes:v}));assert.throws(()=>validate({...c,min_value:NaN}));});
test('reject missing and coincident required points',()=>{assert.throws(()=>validate({...c,points:{}}));assert.throws(()=>validate({...c,points:{...c.points,max:c.points.center}}));});
test('strip unsupported fields including camera source',()=>{assert.equal(validate({...c,source_url:'secret'}).source_url,undefined);});
test('reject duplicate device mappings',()=>{assert.throws(()=>validateAll([c,{...c,id:'other'}]));});
test('counterclockwise keeps a valid sweep',()=>{const flipped={...c,direction:'ccw',points:{...c.points,min:c.points.max,max:c.points.min}};validate(flipped);assert.ok(Math.abs(geometry(flipped).span-geometry(c).span)<1e-10);});
test('legacy reference point remains accepted but is not required',()=>{const legacy={...c,points:{...c.points,reference:[.68,.32]}};const out=validate(legacy);assert.deepEqual(out.points.reference,[.68,.32]);});
test('perspective correction accepts four corners and homography maps them',()=>{const pc=validate({...c,perspective_enabled:true,perspective_points:{tl:[.1,.1],tr:[.9,.08],br:[.95,.9],bl:[.05,.92]}});const m=perspectiveModel(pc);assert.ok(m.width>16&&m.height>16);const q=transformPoint(m.H,m.src[0]);assert.ok(Math.abs(q[0])<1e-6&&Math.abs(q[1])<1e-6);assert.ok(geometry(pc).span>0);});
test('perspective correction rejects incomplete corners',()=>{assert.throws(()=>validate({...c,perspective_enabled:true,perspective_points:{tl:[0,0]}}));});

test('browser-side instant analyzer detects a known 50 percent needle',async()=>{
  const {analyzeImageData}=await import('../docs/assets/calibration.mjs');
  const cfg=validate({id:'instant',camera_id:'1',facility_id:'A',device_id:'B',name:'Instant',type:'water',unit:'%',min_value:0,max_value:100,direction:'cw',interval_minutes:60,enabled:true,is_demo:false,polarity:'dark',min_confidence:.3,inner_radius:.35,outer_radius:.85,perspective_enabled:false,perspective_points:{},image_size:[400,300],points:{min:[.2,.6],center:[.5,.8],max:[.8,.6]}});
  const w=400,h=300,data=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++){data[i*4]=data[i*4+1]=data[i*4+2]=230;data[i*4+3]=255;}
  const {start,span}=geometry(cfg),a=start+span*.5,cx=200,cy=240,tx=cx+Math.cos(a)*140,ty=cy+Math.sin(a)*140,vx=tx-cx,vy=ty-cy,den=vx*vx+vy*vy;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const wx=x-cx,wy=y-cy,t=Math.max(0,Math.min(1,(wx*vx+wy*vy)/den)),dx=x-(cx+t*vx),dy=y-(cy+t*vy);if(dx*dx+dy*dy<=6.25){const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=20;}}
  const r=analyzeImageData({width:w,height:h,data},cfg);assert.equal(r.status,'normal');assert.ok(Math.abs(r.value-50)<2);assert.ok(r.confidence>.8);
});
