export const DEFAULT_DEMO_IMAGE='assets/demo-meter.png';
export function demoImagePath(c){return c.demo_image||DEFAULT_DEMO_IMAGE;}
export function validDemoImagePath(path){return typeof path==='string'&&/^assets\/demo-images\/[a-f0-9]{64}\.png$/.test(path);}
export async function prepareDemoImage(im){
  const canvas=document.createElement('canvas');canvas.width=im.naturalWidth;canvas.height=im.naturalHeight;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('保存用画像を作成できません。');
  ctx.drawImage(im,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob||blob.size>10*1024*1024)throw Error('保存用PNG画像は10MB以下にしてください。');
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const hash=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {path:'assets/demo-images/'+hash+'.png',content:btoa(binary)};
}
