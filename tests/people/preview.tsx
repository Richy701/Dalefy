import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { BulkAddPeopleDialog } from '../../src/components/shared/BulkAddPeopleDialog';
import type { Trip, User } from '../../src/types';
const person: User = { id:'ama', name:'Ama Mensah', email:'', initials:'AM', role:'Traveler', avatar:'' };
const trip = { id:'preview',name:'Sample trip — import preview',travelers:[person],travelerIds:['ama'] } as Trip;
function Preview(){
 const [open,setOpen]=useState(true),[fail,setFail]=useState(false),[result,setResult]=useState('');
 return <main style={{padding:32}}><h1>Sample data only — nothing is sent or saved</h1><label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/> Simulate a failed save</label><button onClick={()=>setOpen(true)}>Open import</button><pre>{result}</pre><BulkAddPeopleDialog open={open} onOpenChange={setOpen} existing={[person]} trips={[trip]} initialTripId="preview" onAdd={async selection=>{await new Promise(resolve=>setTimeout(resolve,8000));if(fail)throw new Error('Simulated connection error. Your list is still here.');setResult(JSON.stringify(selection,null,2));}}/></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
