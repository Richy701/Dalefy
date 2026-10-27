import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
let env;
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-dalefy-security',firestore:{rules:readFileSync('firestore.rules','utf8')}});
 await env.withSecurityRulesDisabled(async c=>{
 const db=c.firestore();
 await db.doc('organizations/invite-test').set({created_by:'invite-owner',name:'Example'});
 await db.doc('org_members/invite-owner_invite-test').set({user_id:'invite-owner',organization_id:'invite-test',role:'owner'});
 for(const [id,expiry,status] of [['active',Date.now()+86400000,'pending'],['fresh',Date.now()+86400000,'pending'],['expired',Date.now()-86400000,'pending'],['revoked',Date.now()+86400000,'revoked']]) await db.doc(`org_invites/test-${id}`).set({email:'new@example.test',organization_id:'invite-test',role:'agent',status,expires_at_ms:expiry});
 });
});
after(async()=>env?.cleanup());
const user=(uid='invite-new',email='new@example.test',verified=true)=>env.authenticatedContext(uid,{email,email_verified:verified}).firestore();
test('new invitee can query an absent own membership and accept atomically',async()=>{
 const db=user();const member=db.doc('org_members/invite-new_invite-test');
 await assertFails(member.get());
 await assertSucceeds(db.collection('org_members').where('user_id','==','invite-new').where('organization_id','==','invite-test').get());
 const batch=db.batch();batch.set(member,{user_id:'invite-new',organization_id:'invite-test',role:'agent',invite_token:'test-fresh'});batch.update(db.doc('org_invites/test-fresh'),{status:'accepted'});batch.set(db.doc('profiles/invite-new'),{current_org_id:'invite-test'},{merge:true});await assertSucceeds(batch.commit());
});
test('expired, revoked, wrong-email and unverified invitations cannot grant membership',async()=>{
 for(const [id,email,verified] of [['expired','new@example.test',true],['revoked','new@example.test',true],['active','other@example.test',true],['active','new@example.test',false]]){
 const db=user('blocked',email,verified);await assertFails(db.doc('org_members/blocked_invite-test').set({user_id:'blocked',organization_id:'invite-test',role:'agent',invite_token:`test-${id}`}));
 }
});
test('admin can atomically revoke an expired invitation and create a replacement',async()=>{
 const db=user('invite-owner','owner@example.test');const batch=db.batch();batch.update(db.doc('org_invites/test-expired'),{status:'revoked'});batch.set(db.doc('org_invites/test-replacement'),{email:'new@example.test',organization_id:'invite-test',role:'agent',status:'pending',expires_at_ms:Date.now()+86400000});await assertSucceeds(batch.commit());
});
