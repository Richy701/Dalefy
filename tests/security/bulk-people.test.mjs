import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as firestore from 'firebase/firestore';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
const owner='bulk-owner-123456789012345', viewer='bulk-viewer-123456789012345';
let env;
const person={id:'ama',name:'Ama Mensah',email:'',initials:'AM',role:'Traveler',avatar:''};
const incoming={...person,email:'ama@example.com'};
const created={...person,id:'kofi',name:'Kofi Boateng',email:'kofi@example.com'};
const trip={id:'bulk-trip',name:'Sample',travelers:[person],travelerIds:['ama']};
function load(file, modules){const exports={};const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInThisContext(`(function(exports,require){${code}\n})`)(exports,n=>{if(!(n in modules))throw Error(n);return modules[n];});return exports;}
const sync=load('src/lib/travelerSync.ts',{'@/lib/names':{initialsFrom:()=> 'AM'}});
const tripSave=load('src/lib/tripSave.ts',{});
const personChanges=load('src/lib/personChanges.ts',{'./tripSave':tripSave});
const bulk=load('src/lib/bulkPeople.ts',{'./travelerSync':sync});
function importer(uid=owner,directory=[person]){
 const db=env.authenticatedContext(uid,{email:`${uid}@example.test`,email_verified:true}).firestore();
 return load('src/hooks/useBulkPeopleImport.ts',{
 '@tanstack/react-query':{useQueryClient:()=>({setQueryData:()=>{}})},'firebase/firestore':firestore,
 '@/context/AuthContext':{useAuth:()=>({user:{id:uid}})},'@/context/OrgContext':{useOrg:()=>({currentOrg:{id:'bulk-org'}})},
 '@/context/TripsContext':{useTrips:()=>({trips:[trip],updateTrip:()=>{throw Error('must use atomic cloud save');}})},
 '@/context/directory':{useDirectoryTravelers:()=>[directory,()=>{throw Error('must use atomic cloud save');}]},
 '@/services/firebase':{firebaseDb:()=>db,isFirebaseConfigured:()=>true},'@/lib/bulkPeople':bulk,'@/lib/personChanges':personChanges,'@/lib/travelerSync':sync,
 }).useBulkPeopleImport();
}
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-dalefy-security',firestore:{rules:readFileSync('firestore.rules','utf8')}});
 await env.withSecurityRulesDisabled(async c=>{
 const db=c.firestore();
 for(const [uid,role] of [[owner,'owner'],[viewer,'viewer']])await db.doc(`org_members/${uid}_bulk-org`).set({user_id:uid,organization_id:'bulk-org',role});
 await db.doc('trips/bulk-trip').set({user_id:owner,organization_id:'bulk-org',name:'Sample',events:[],travelers:[{...person,invitedAt:'original'}],traveler_ids:['ama'],status:'Draft'});
 await db.doc('directory_travelers/bulk-org__ama').set({organization_id:'bulk-org',user_id:owner,traveler:person});
 });
});
after(async()=>env?.cleanup());
test('real import saves directory, trip email lookup and version in one transaction; retry adds no duplicate',async()=>{
 const save=importer();const selection={matched:[incoming],created:[created],tripId:trip.id};
 await save(selection);await save(selection);
 await env.withSecurityRulesDisabled(async c=>{
 const db=c.firestore();const data=(await db.doc('trips/bulk-trip').get()).data();
 assert.equal(data.travelers.length,2);assert.equal(data.travelers[0].email,incoming.email);assert.equal(data.travelers[0].invitedAt,'original');
 assert.deepEqual(data.traveler_emails.sort(),[incoming.email,created.email].sort());
 assert.equal(data.pax_count,'2');assert.equal((await db.doc('directory_travelers/bulk-org__kofi').get()).data().traveler.email,created.email);
 assert.ok((await db.doc('trip_versions/bulk-trip').get()).exists);
 });
});
test('email conflict aborts the whole import, including any new person',async()=>{
 await assert.rejects(importer()({matched:[{...incoming,email:'different@example.test'}],created:[{...created,id:'blocked'}],tripId:trip.id}),/email changed/);
 await env.withSecurityRulesDisabled(async c=>assert.equal((await c.firestore().doc('directory_travelers/bulk-org__blocked').get()).exists,false));
});
test('viewer cannot import and no partial directory write remains',async()=>{
 await assert.rejects(importer(viewer)( {matched:[],created:[{...created,id:'forbidden'}],tripId:trip.id}));
 await env.withSecurityRulesDisabled(async c=>assert.equal((await c.firestore().doc('directory_travelers/bulk-org__forbidden').get()).exists,false));
});
