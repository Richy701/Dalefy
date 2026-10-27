const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
function load(file, modules={}){const exports={};vm.runInThisContext(`(function(exports,require){${ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText}\n})`)(exports,n=>modules[n]);return exports;}
const save=load('src/lib/tripSave.ts');const people=load('src/lib/personChanges.ts',{'./tripSave':save});
const keep={id:'keep',name:'Laura Davies',email:'laura@example.com',avatar:'photo.png',initials:'LD'};
test('concurrent unrelated trip fields are preserved; same-field collisions stop saving',()=>{
 assert.deepEqual(save.tripPatch({name:'A',events:[]},{name:'B',events:[]},{name:'A',events:[{id:'new'}]}),{name:'B'});
 assert.throws(()=>save.tripPatch({events:[]},{events:[{id:'mine'}]},{events:[{id:'theirs'}]}),/another session/);
 assert.deepEqual(save.tripPatch({name:'A'},{name:'B'},{name:'B'}),{name:'B'});
});
test('merging preserves invitation history, trip membership, event assignments and published copies',()=>{
 const result=people.changePersonOnTrip({travelers:[{id:'dup',name:'Laura',invitedAt:'yesterday'},keep],traveler_ids:['dup','keep'],events:[{id:'e',assignedTo:['dup','keep','else']}],organizer:{travelerId:'dup',name:'Old',company:'Company'},published_snapshot:{travelers:[{id:'dup',name:'Laura'}],events:[{id:'e',assignedTo:['dup']}],organizer:{travelerId:'dup',name:'Old'}}},keep,'dup');
 assert.equal(result.travelers.length,1);assert.equal(result.travelers[0].invitedAt,'yesterday');assert.deepEqual(result.traveler_ids,['keep']);assert.deepEqual(result.events[0].assignedTo,['keep','else']);assert.equal(result.organizer.travelerId,'keep');assert.equal(result.organizer.avatar,'photo.png');assert.equal(result.organizer.company,'Company');assert.equal(result.published_snapshot.travelers[0].email,keep.email);assert.equal(result.published_snapshot.paxCount,'1');
});
test('linked organiser refreshes contact fields and clears when removed; manual contacts stay unchanged',()=>{
 const linked=save.syncLinkedOrganizer({travelers:[keep],organizer:{travelerId:'keep',name:'Old',phone:'123'}});assert.equal(linked.organizer.name,keep.name);assert.equal(linked.organizer.phone,'123');assert.equal(save.syncLinkedOrganizer({travelers:[],organizer:linked.organizer}).organizer,null);assert.equal(save.syncLinkedOrganizer({travelers:[],organizer:{name:'External'}}).organizer.name,'External');
});
test('duplicate details retain separate compliance records and missing contact details',()=>{
 const result=people.combinePersonDetails({...keep,email:'',compliance:[{name:'Form',status:'Pending'}]},{...keep,id:'dup',compliance:[{name:'Form',status:'Signed'}]});assert.equal(result.email,keep.email);assert.equal(result.compliance.length,2);
});
for(const role of ['owner','admin','agent','viewer','unknown',null])test(`messaging permission for ${role}`,async()=>{
 const {canEditTrip}=load('api/_tripPermissions.ts',{'./_firebaseAdmin.js':{decodeValue:v=>v,getDocument:async()=>role?{fields:{role}}:null}});
 assert.equal(await canEditTrip('creator',{user_id:'creator',organization_id:'org'}),['owner','admin','agent'].includes(role));
});
for(const endpoint of ['send-push','notify-trip-update','send-itinerary'])test(`${endpoint} rejects viewers before sending`,async()=>{
 const admin={decodeValue:v=>v,getDocument:async collection=>collection==='trips'?{fields:{user_id:'viewer',organization_id:'org'}}:{fields:{role:'viewer'}}};
 const permission=load('api/_tripPermissions.ts',{'./_firebaseAdmin.js':admin});
 const fail=()=>{throw Error('must not send');};
 const handler=load(`api/${endpoint}.ts`,{'./_tripPermissions.js':permission,'./_firebaseAdmin.js':admin,'./_verifyToken.js':{verifyFirebaseToken:async()=>({sub:'viewer'})},'./_rateLimit.js':{rateLimit:()=>true},'./_mailer.js':{emailEnabled:()=>true,sendEmail:fail},'./_expoPush.js':{sendPush:fail},'../src/lib/itineraryEmail.js':{renderItineraryEmail:fail}}).default;
 let status=200;const res={status(n){status=n;return this;},json(){return this;}};
 await handler({method:'POST',headers:{authorization:'Bearer mock'},body:{tripId:'trip',tripName:'Trip',changes:['changed'],to:'all',body:'Message',subject:'Trip',recipients:[{email:'test@example.com'}]}},res);
 assert.equal(status,403);
});
