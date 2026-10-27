import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const cache = {};
function load(file, modules = {}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>modules[n] || cache[n],console});return exports;
}
cache['@/lib/names']={initialsFrom:()=> 'AM'};
cache['./travelerSync']=load('src/lib/travelerSync.ts');
const {assessPeople,mergePeopleIntoTrip}=load('src/lib/bulkPeople.ts');
const {parsePeople}=load('src/lib/parsePeople.ts');
const person={id:'ama',name:'Ama Mensah',email:'',initials:'AM',avatar:'',role:'Traveler'};
const row=(name,email,include=true)=>({key:0,name,email,include});
const plain=x=>JSON.parse(JSON.stringify(x));
test('CSV maps reordered columns and ignores unrelated booking fields',()=>{
 const result=parsePeople('\nEmail,Hotel,Last Name,First Name\nama@example.com,Seaside,Mensah,Ama');
 assert.deepEqual(plain(result),[{name:'Ama Mensah',email:'ama@example.com',line:3}]);
});
test('Excel tabs and Outlook recipient lists keep every email',()=>{
 assert.equal(parsePeople('First Name\tEmail\tLast Name\nAma\tama@example.com\tMensah')[0].name,'Ama Mensah');
 const list=parsePeople('Ama Mensah <ama@example.com>; Kofi Boateng <kofi@example.com>');
 assert.equal(list.length,2);assert.equal(list[1].email,'kofi@example.com');
 assert.equal(parsePeople('ama@example.com; kofi@example.com').length,2);
});
test('invalid email stays visible for correction',()=>{
 const parsed=parsePeople('Name,Email\nAma Mensah,ama@');
 assert.equal(parsed[0].email,'ama@');assert.equal(assessPeople([row(parsed[0].name,parsed[0].email)],[])[0].status,'invalidEmail');
 assert.equal(parsePeople('Ama Mensah,ama@')[0].email,'ama@');
});
test('existing person already on trip can receive their missing email',()=>{
 const result=assessPeople([row('Ama Mensah','ama@example.com')],[person],new Set(['ama']))[0];
 assert.equal(result.status,'update');assert.equal(result.eligible,true);assert.equal(result.matched.id,'ama');
 const merged=mergePeopleIntoTrip({travelers:[{...person,invitedAt:'yesterday'}],travelerIds:['ama']},[{...person,email:'ama@example.com'}],true);
 assert.equal(merged.travelers.length,1);assert.equal(merged.travelers[0].email,'ama@example.com');assert.equal(merged.travelers[0].invitedAt,'yesterday');
});
test('conflicting and ambiguous matches require review',()=>{
 assert.equal(assessPeople([row('Ama Mensah','new@example.com')],[{...person,email:'old@example.com'}])[0].status,'conflict');
 assert.equal(assessPeople([row('Ama Mensah','')],[person,{...person,id:'ama2'}])[0].status,'conflict');
});
test('email-only entry can match an existing person; new email-only entries require a name',()=>{
 assert.equal(assessPeople([row('','ama@example.com')],[{...person,email:'ama@example.com'}])[0].eligible,true);
 assert.equal(assessPeople([row('','new@example.com')],[])[0].status,'noName');
});
test('duplicate counts track selection and never save the same person twice',()=>{
 const rows=[row('Ama Mensah','ama@example.com'),row('Ama Mensah','ama@example.com')];
 assert.equal(assessPeople(rows,[]).filter(x=>x.eligible).length,1);
 rows[0].include=false;assert.equal(assessPeople(rows,[])[1].eligible,true);
});
test('directory imports update existing trip copies without adding unrelated people',()=>{
 const result=mergePeopleIntoTrip({travelers:[person],travelerIds:['ama']},[{...person,email:'ama@example.com'},{...person,id:'new'}],false);
 assert.equal(result.travelers.length,1);assert.equal(result.travelers[0].email,'ama@example.com');
});
test('a directory email can refresh an existing trip whose copied email is missing',()=>{
 const contact={...person,email:'ama@example.com'};
 assert.equal(assessPeople([row(person.name,contact.email)],[contact],new Set(['ama']))[0].status,'sync');
 assert.equal(mergePeopleIntoTrip({travelers:[person],travelerIds:['ama']},[contact],true).travelers[0].email,contact.email);
});
