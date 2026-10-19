import {useEffect,useState} from 'react';
export function useResource(loader,key=''){
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[version,setVersion]=useState(0);
  useEffect(()=>{let active=true;setLoading(true);setError('');Promise.resolve().then(loader).then(r=>{if(active)setData(r);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[key,version]);
  return {data,setData,error,loading,reload:()=>setVersion(v=>v+1)};
}
