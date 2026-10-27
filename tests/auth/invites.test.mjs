import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, modules, globals = {}) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: n => { if (!(n in modules)) throw Error(n); return modules[n]; }, console, ...globals });
 return exports;
}
const invite = { email:'person@example.test', role:'agent', organization_id:'agency', org_name:'Example', status:'pending', expires_at:new Date(Date.now()+86400000).toISOString() };
test('new member accepts using a permitted query and atomic membership/invite/profile writes', async () => {
 const writes=[]; let queries=0;
 const user={uid:'new',email:invite.email,emailVerified:true,reload:async()=>{},getIdToken:async()=>{}};
 const api=load('src/services/invites.ts', {
  'firebase/firestore':{doc:(_,c,id)=>`${c}/${id}`,getDoc:async path=>{assert.equal(path,'org_invites/token');return {exists:()=>true,data:()=>invite};},collection:(_,c)=>c,query:(...args)=>args,where:(...args)=>args,getDocs:async q=>{queries++;assert.equal(q[0],'org_members');return {empty:true};},writeBatch:()=>({set:(...a)=>writes.push(['set',...a]),update:(...a)=>writes.push(['update',...a]),commit:async()=>writes.push(['commit'])})},
  './firebase':{firebaseAuth:()=>({currentUser:user}),firebaseDb:()=>({})},'@/lib/api':{}
 });
 const result=await api.acceptInvite('token');
 assert.equal(result.alreadyMember,false);assert.equal(queries,1);assert.equal(writes.length,4);
 assert.equal(writes[0][1],'org_members/new_agency');assert.equal(writes[0][2].role,'agent');
 assert.equal(writes[1][2].status,'accepted');assert.equal(writes[2][2].current_org_id,'agency');
});
for(const expired of [false,true]) test(`resend ${expired?'expired':'valid'} invitation`,async()=>{
 const calls=[];let mailed;
 const doc=data=>({fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,{stringValue:v}]))});
 const oldExpiry=new Date(Date.now()+(expired?-86400000:86400000)).toISOString();
 const handler=load('api/send-invite.ts',{
  'node:crypto':{randomUUID:()=> 'fresh-token'},'./_verifyToken.js':{verifyFirebaseToken:async()=>({sub:'owner',email:'owner@example.test'})},'./_rateLimit.js':{rateLimit:()=>true},'./_mailer.js':{sendEmail:async()=>({ok:true})},'./_firebaseAuthAdmin.js':{generateSignInLink:async(email,settings)=>{mailed={email,settings};return {ok:true,url:'https://example.test/signin'};}},'../src/lib/email/templates.js':{inviteEmail:()=>({subject:'Invite',html:'email',text:'email'})}
 },{process:{env:{}},fetch:async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>url.includes('org_members')?doc({role:'owner'}):url.includes('organizations')?doc({name:'Example'}):doc({...invite,expires_at:oldExpiry}),text:async()=>''};}}).default;
 let result;const res={status:()=>res,json:r=>{result=r;return r;}};
 await handler({method:'POST',headers:{authorization:'Bearer test'},body:{orgId:'agency',resendToken:'old-token'}},res);
 assert.equal(result.emailSent,true);
 assert.equal(result.inviteToken,expired?'fresh-token':'old-token');
 assert.ok(mailed.settings.url.includes(result.inviteToken));
 const commit=calls.find(c=>c.url.endsWith(':commit'));
 assert.equal(!!commit,expired);
 if(expired){const writes=JSON.parse(commit.options.body).writes;assert.equal(writes[0].update.fields.status.stringValue,'revoked');assert.equal(writes[1].update.fields.status.stringValue,'pending');assert.ok(Number(writes[1].update.fields.expires_at_ms.integerValue)>Date.now());}
});
for(const [label,patch,userPatch,expected] of [
 ['expired',{expires_at:new Date(0).toISOString()},{},'expired'],
 ['revoked',{status:'revoked'},{},'used'],
 ['wrong email',{}, {email:'other@example.test'},'wrong-email'],
 ['unverified',{}, {emailVerified:false},'unverified'],
]) test(`accept rejects ${label} before any writes`,async()=>{
 const user={uid:'new',email:invite.email,emailVerified:true,reload:async()=>{},...userPatch};
 const api=load('src/services/invites.ts',{
 'firebase/firestore':{doc:()=>({}),getDoc:async()=>({exists:()=>true,data:()=>({...invite,...patch})}),writeBatch:()=>{throw Error('must not write');}},
 './firebase':{firebaseAuth:()=>({currentUser:user}),firebaseDb:()=>({})},'@/lib/api':{}
 });
 assert.equal((await api.acceptInvite('token')).code,expected);
});
