import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validate} from '../docs/assets/calibration.mjs';
import {demoImagePath} from '../docs/assets/demo-image.mjs';
import {publishGauge} from '../docs/assets/github-publish.mjs';
const base=validate(JSON.parse(readFileSync(new URL('./fixtures/demo.json',import.meta.url)))[0]);
const imagePath='assets/demo-images/'+'a'.repeat(64)+'.png';
test('legacy demo uses bundled sample, custom path is preserved',()=>{assert.equal(demoImagePath(base),'assets/demo-meter.png');assert.equal(validate({...base,demo_image:imagePath}).demo_image,imagePath);});
test('demo path is restricted to immutable PNG assets',()=>{for(const path of ['../secret','https://example.com/a.png','assets/demo-images/../../x.png','assets/demo-images/a.svg','assets/demo-images/a.png','assets/demo-images/'+'a'.repeat(64)+'.png?token=x'])assert.throws(()=>validate({...base,demo_image:path}));});
function mockApi(remote=[base],rejectUpdate=false){
  const calls=[];const api=async(path,method='GET',body)=>{
    calls.push({path,method,body});
    if(path==='git/ref/heads/main')return {object:{sha:'head'}};
    if(path==='git/commits/head')return {tree:{sha:'base-tree'}};
    if(path==='contents/config/gauges.json?ref=head')return {content:Buffer.from(JSON.stringify(remote)).toString('base64')};
    if(path==='git/blobs')return {sha:'blob-'+calls.length};
    if(path==='git/trees')return {sha:'new-tree'};
    if(path==='git/commits')return {sha:'new-commit'};
    if(path==='git/refs/heads/main'){if(rejectUpdate)throw Error('GitHub API 422');return {};}
    throw Error('Unexpected API call '+path);
  };return {api,calls};
}
test('image and calibration become one commit, preserving the parent tree',async()=>{
  const {api,calls}=mockApi(),c={...base,demo_image:imagePath};
  await publishGauge(api,c,base.id,base,{path:imagePath,content:'aW1hZ2U='});
  const entries=calls.find(c=>c.path==='git/trees').body;
  assert.equal(entries.base_tree,'base-tree');assert.equal(entries.tree.length,2);
  assert.equal(entries.tree[1].path,'docs/'+imagePath);
  const json=JSON.parse(Buffer.from(calls.filter(c=>c.path==='git/blobs')[0].body.content,'base64'));
  assert.equal(json[0].demo_image,imagePath);
  assert.deepEqual(calls.find(c=>c.path==='git/commits').body.parents,['head']);
  assert.deepEqual(calls.at(-1).body,{sha:'new-commit',force:false});
});
test('a camera test image is never uploaded for a real camera setting',async()=>{const {api,calls}=mockApi();await publishGauge(api,{...base,is_demo:false},base.id,base,{path:imagePath,content:'image'});assert.equal(calls.filter(c=>c.path==='git/blobs').length,1);assert.equal(calls.find(c=>c.path==='git/trees').body.tree.length,1);});
test('conflicting calibration fails before any writes',async()=>{const {api,calls}=mockApi([{...base,max_value:200}]);await assert.rejects(publishGauge(api,{...base,demo_image:imagePath},base.id,base,{path:imagePath,content:'image'}),/更新されています/);assert.ok(calls.every(c=>c.method==='GET'));});
test('concurrent main update is never overwritten',async()=>{const {api,calls}=mockApi([base],true);await assert.rejects(publishGauge(api,base,base.id,base,null),/422/);assert.equal(calls.at(-1).body.force,false);});
