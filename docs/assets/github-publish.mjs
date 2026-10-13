import {validate,validateAll} from './calibration.mjs?v=20261013-3';
function base64Utf8(text){const bytes=new TextEncoder().encode(text);let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
function decodeFile(file){return new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0)));}
export async function publishGauge(api,c,oldId,base,pendingImage){
  // Read an immutable head so the image, calibration and parent share one snapshot.
  const ref=await api('git/ref/heads/main');
  const head=ref.object.sha;
  const parent=await api('git/commits/'+head);
  const file=await api('contents/config/gauges.json?ref='+encodeURIComponent(head));
  const remote=validateAll(JSON.parse(decodeFile(file)));
  const previous=oldId?remote.find(x=>x.id===oldId):null;
  if(oldId&&base&&previous&&JSON.stringify(previous)!==JSON.stringify(validate(base)))throw Error('公開設定が別の操作で更新されています。ページを再読み込みしてから編集してください。');
  if(oldId&&base&&!previous)throw Error('この計器は既に削除されています。ページを再読み込みしてください。');
  if(c.id!==oldId&&remote.some(x=>x.id===c.id))throw Error('変更先の設定ID「'+c.id+'」は既に使われています。');
  c=validate(c);
  const merged=validateAll([...remote.filter(x=>x.id!==oldId&&x.id!==c.id),c]);
  const configBlob=await api('git/blobs','POST',{encoding:'base64',content:base64Utf8(JSON.stringify(merged,null,2)+'\n')});
  const treeEntries=[{path:'config/gauges.json',mode:'100644',type:'blob',sha:configBlob.sha}];
  if(pendingImage&&c.is_demo){
    if(c.demo_image!==pendingImage.path)throw Error('デモ画像と設定の対応を確認してください。');
    const blob=await api('git/blobs','POST',{encoding:'base64',content:pendingImage.content});
    treeEntries.push({path:'docs/'+pendingImage.path,mode:'100644',type:'blob',sha:blob.sha});
  }
  const tree=await api('git/trees','POST',{base_tree:parent.tree.sha,tree:treeEntries});
  const message=oldId&&oldId!==c.id?'Rename gauge '+oldId+' to '+c.id:'Update gauge calibration'+(pendingImage&&c.is_demo?' and demo image':'')+': '+c.id;
  const commit=await api('git/commits','POST',{message,tree:tree.sha,parents:[head]});
  // A concurrent edit or collector commit makes this non-fast-forward: keep all remote work.
  await api('git/refs/heads/main','PATCH',{sha:commit.sha,force:false});
  return merged;
}
