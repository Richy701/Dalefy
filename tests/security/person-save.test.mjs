import {before,after,test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import * as firestore from 'firebase/firestore';import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
const uid='person-owner-123456789012345', viewer='person-viewer-123456789012345', org='person-org';let env;
const keep={id:'keep',name:'Laura Davies',email:'laura@example.com',avatar:'photo.png',initials:'LD',role:'Traveler',status:'Active'};
const other={...keep,id:'duplicate',email:'',avatar:'',profile:{dietary:'Vegetarian'}};
function load(file,modules={}){const exports={};vm.runInThisContext(`(function(exports,require){${ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText}\n})`)(exports,n=>{if(!(n in modules))throw Error(n);return modules[n]});return exports;}
const save=load('src/lib/tripSave.ts'), changes=load('src/lib/personChanges.ts',{'./tripSave':save});
const sync=load('src/lib/travelerSync.ts',{'@/lib/names':{initialsFrom:()=> 'LD'}});
function saver(user=uid){const db=env.authenticatedContext(user,{email:`${user}@example.test`,email_verified:true}).firestore();return load('src/hooks/useSavePerson.ts',{
 'firebase/firestore':firestore,'@tanstack/react-query':{useQueryClient:()=>({invalidateQueries:async()=>{}})},'@/context/AuthContext':{useAuth:()=>({user:{id:user}})},'@/context/OrgContext':{useOrg:()=>({currentOrg:{id:org}})},'@/context/directory':{useDirectoryTravelers:()=>[[keep,other],()=>{throw Error('must save atomically')}]},'@/context/TripsContext':{useTrips:()=>({trips:[],updateTrip:()=>{throw Error('must save atomically')}})},'@/services/firebase':{firebaseDb:()=>db,isFirebaseConfigured:()=>true},'@/lib/personChanges':changes,'@/lib/travelerSync':sync,'@/lib/names':{initialsFrom:()=> 'LD'},}).useSavePerson();}
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-dalefy-person-save',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [id,role] of [[uid,'owner'],[viewer,'viewer']])await db.doc(`org_members/${id}_${org}`).set({user_id:id,organization_id:org,role});for(const person of [keep,other])await db.doc(`directory_travelers/${org}__${person.id}`).set({organization_id:org,user_id:uid,traveler:person});
await db.doc('trips/test-trip').set({organization_id:org,user_id:uid,name:'Test',status:'Published',travelers:[keep,other],traveler_ids:['keep','duplicate'],events:[{id:'e',assignedTo:['duplicate']}],organizer:{travelerId:'duplicate',name:'Laura',phone:'123'},published_snapshot:{travelers:[other],events:[{id:'e',assignedTo:['duplicate']}],organizer:{travelerId:'duplicate',name:'Laura'}}});
await db.doc('trip_members/member').set({uid:'app-user',device_id:'phone',trip_id:'test-trip',name:'Laura',linked_traveler_id:'duplicate',role:'leader'});
await db.doc(`traveler_compliance/${org}__duplicate`).set({organization_id:org,user_id:uid,traveler_id:'duplicate',docs:[{name:'Form',status:'Signed'}]});});});after(async()=>env?.cleanup());
test('viewer cannot edit a profile and no partial changes are made',async()=>{await assert.rejects(saver(viewer)(keep,{name:'Forbidden'}));await env.withSecurityRulesDisabled(async c=>assert.equal((await c.firestore().doc(`directory_travelers/${org}__keep`).get()).data().traveler.name,keep.name));});
test('profile save synchronizes contact copies and waits for commit',async()=>{await saver()(keep,{avatar:'new-photo.png'});await env.withSecurityRulesDisabled(async c=>{const trip=(await c.firestore().doc('trips/test-trip').get()).data();assert.equal(trip.travelers[0].avatar,'new-photo.png');assert.equal((await c.firestore().doc(`directory_travelers/${org}__keep`).get()).data().traveler.avatar,'new-photo.png');});});
test('stale profile edit aborts without overwriting the newer photo',async()=>{await assert.rejects(saver()(keep,{avatar:'stale-photo.png'}),/another session/);});
test('merge transfers event assignments, published roster, organiser, compliance and app link atomically',async()=>{
 const current={...keep,avatar:'new-photo.png'};await saver()(current,{},other);
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore(), trip=(await db.doc('trips/test-trip').get()).data(), member=(await db.doc('trip_members/member').get()).data();assert.equal(trip.travelers.length,1);assert.deepEqual(trip.events[0].assignedTo,['keep']);assert.equal(trip.published_snapshot.travelers[0].id,'keep');assert.equal(trip.organizer.travelerId,'keep');assert.equal(trip.organizer.avatar,'new-photo.png');assert.equal(member.linked_traveler_id,'keep');assert.equal(member.role,'leader');assert.equal((await db.doc(`directory_travelers/${org}__duplicate`).get()).exists,false);assert.equal((await db.doc(`directory_travelers/${org}__keep`).get()).data().traveler.profile.dietary,'Vegetarian');assert.equal((await db.doc(`traveler_compliance/${org}__keep`).get()).data().docs[0].status,'Signed');assert.equal((await db.doc(`traveler_compliance/${org}__duplicate`).get()).exists,false);});
});
test('real trip save preserves unrelated remote changes, merges edits to different cards and rejects edits to the same card',async()=>{
 const db=env.authenticatedContext(uid,{email:`${uid}@example.test`,email_verified:true}).firestore();
 const service=load('src/services/firebaseTrips.ts',{'firebase/firestore':firestore,'firebase/storage':{},'firebase/auth':{},'./firebase':{firebaseDb:()=>db,firebaseAuth:()=>({currentUser:{uid}})},'@/lib/shrinkImage':{},'@/lib/logger':{logger:{log:()=>{},error:()=>{}}},'@/lib/tripSave':save,'@/lib/travelerSync':sync});
 const baseline={id:'concurrent-trip',name:'Original',start:'2026-11-01',end:'2026-11-02',status:'Draft',events:[],image:'',travelers:[],travelerIds:[],organizationId:org};
 await env.withSecurityRulesDisabled(async c=>c.firestore().doc('trips/concurrent-trip').set({user_id:uid,organization_id:org,name:baseline.name,start:baseline.start,end_date:baseline.end,status:'Draft',events:[{id:'remote',title:'Remote change'}],travelers:[],traveler_ids:[],image:''}));
 await service.upsertTrip({...baseline,name:'Renamed'},org,baseline);
 const data=(await firestore.getDoc(firestore.doc(db,'trips','concurrent-trip'))).data();assert.equal(data.name,'Renamed');assert.equal(data.events[0].id,'remote');
 await service.upsertTrip({...baseline,events:[{id:'local',title:'Local change'}]},org,baseline);
 assert.deepEqual((await firestore.getDoc(firestore.doc(db,'trips','concurrent-trip'))).data().events.map(e=>e.id).sort(),['local','remote']);
 const seen={...baseline,events:[{id:'remote',title:'Remote change'}]};
 await env.withSecurityRulesDisabled(async c=>c.firestore().doc('trips/concurrent-trip').update({events:[{id:'remote',title:'Edited elsewhere'},{id:'local',title:'Local change'}]}));
 await assert.rejects(service.upsertTrip({...seen,events:[{id:'remote',title:'Edited here'}]},org,seen),/"Edited here" was changed in another session/);
 assert.equal((await firestore.getDoc(firestore.doc(db,'trips','concurrent-trip'))).data().events[0].title,'Edited elsewhere');
});

test('a trip creator downgraded to viewer cannot edit or delete the organisation trip',async()=>{
 const db=env.authenticatedContext(viewer,{email:`${viewer}@example.test`,email_verified:true}).firestore();
 await env.withSecurityRulesDisabled(async c=>c.firestore().doc('trips/former-owner').set({user_id:viewer,organization_id:org,name:'Protected',events:[],status:'Draft'}));
 await assert.rejects(firestore.updateDoc(firestore.doc(db,'trips','former-owner'),{name:'Forbidden'}));
 await assert.rejects(firestore.deleteDoc(firestore.doc(db,'trips','former-owner')));
});
