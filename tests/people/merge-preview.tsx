import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { MergePeopleDialog } from '../../src/components/shared/MergePeopleDialog';
import type { User } from '../../src/types';
const base={name:'Sample Person',initials:'SP',role:'Traveler',status:'Active',avatar:''};
const people=[{...base,id:'keep',email:'first@example.com',profile:{dietary:'Vegetarian'}},{...base,id:'duplicate',email:'second@example.com',profile:{dietary:'Vegan'}}] as User[];
function Preview(){const [open,setOpen]=useState(true),[result,setResult]=useState('');return <main><h1>Sample data only</h1><pre>{result}</pre>{open&&<MergePeopleDialog people={people} onClose={()=>setOpen(false)} onMerge={async(keep,other,patch)=>{await new Promise(r=>setTimeout(r,1000));setResult(JSON.stringify({keep:keep.id,other:other.id,patch},null,2));}}/>}</main>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
