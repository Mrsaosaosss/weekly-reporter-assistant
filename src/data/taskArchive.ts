import {db,type ReportDatabase} from './database'
import {uid,validateReportMeta,type RestorePreview} from '../core/model'
export const archiveTables=['tasks','files','items','fragments','proposals','reviews','batches','snapshots','differences','exports','mappings','matches'] as const
type Archive={app:'weekly-report-tool';version:1;createdAt:string;data:Record<string,any[]>}
async function readBlob(blob:Blob):Promise<string>{if(typeof blob.text==='function')return blob.text();return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('文件读取失败'));r.readAsText(blob)})}
function encode(value:unknown):unknown {if(ArrayBuffer.isView(value))return {__bytes:Array.from(new Uint8Array(value.buffer,value.byteOffset,value.byteLength))};if(Array.isArray(value))return value.map(encode);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]));return value}
function decode(value:any):any {if(value&&typeof value==='object'&&'__bytes'in value){if(!Array.isArray(value.__bytes)||value.__bytes.some((b:any)=>!Number.isInteger(b)||b<0||b>255))throw new Error('附件编码损坏');return Uint8Array.from(value.__bytes)}if(Array.isArray(value))return value.map(decode);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)]));return value}
export async function taskArchiveObject(reportId:string|undefined,d:ReportDatabase=db):Promise<Archive>{
 const data:Record<string,any[]>={}
 await d.transaction('r',archiveTables.map(n=>d.table(n)),async()=>{
  for(const name of archiveTables){let rows=await d.table(name).toArray();if(reportId){if(name==='tasks')rows=rows.filter(r=>r.id===reportId);else if(name==='reviews'){const ids=new Set(data.proposals.map(p=>p.id));rows=rows.filter(r=>ids.has(r.proposalId))}else rows=rows.filter(r=>r.reportId===reportId)}data[name]=rows}
 })
 return {app:'weekly-report-tool',version:1,createdAt:new Date().toISOString(),data:encode(data) as Record<string,any[]>}
}
export async function exportTaskArchive(reportId:string,d:ReportDatabase=db){return new Blob([JSON.stringify(await taskArchiveObject(reportId,d))],{type:'application/json'})}
async function parseArchive(blob:Blob):Promise<Archive>{
 if(blob.size>60*1024*1024)throw new Error('任务包超过60MB，请拆分任务')
 const a=decode(JSON.parse(await readBlob(blob))) as Archive
 if(a.app!=='weekly-report-tool'||a.version!==1||!a.data||archiveTables.some(n=>!Array.isArray(a.data[n])))throw new Error('任务包版本或结构不兼容')
 const taskIds=new Set(a.data.tasks.map(t=>t.id)),fileIds=new Set(a.data.files.map(f=>f.id)),itemIds=new Set(a.data.items.map(i=>i.id)),proposalIds=new Set(a.data.proposals.map(p=>p.id)),sourceIds=new Set(a.data.fragments.map(f=>f.id))
 if(a.data.tasks.some(t=>!t.id||validateReportMeta(t.meta).length)||a.data.files.some(f=>!(f.bytes instanceof Uint8Array)||!fileIds.has(f.id)))throw new Error('任务或附件结构损坏')
 for(const name of archiveTables){const keys=new Set();for(const r of a.data[name]){const key=name==='reviews'?r.proposalId:r.id;if(typeof key!=='string'||keys.has(key))throw new Error('任务包包含无效或重复标识');keys.add(key);if(name!=='tasks'&&name!=='reviews'&&!taskIds.has(r.reportId))throw new Error('任务包包含未知任务引用')}}
 if(a.data.items.some(i=>!i.fields||!i.targets||Object.values(i.targets).some((r:any)=>!fileIds.has(r.fileId)))||a.data.proposals.some(p=>!itemIds.has(p.itemId)||!Array.isArray(p.sourceIds)||p.sourceIds.some((id:string)=>!sourceIds.has(id)))||a.data.reviews.some(r=>!proposalIds.has(r.proposalId)))throw new Error('任务包存在缺失引用')
 return a
}
export async function previewRestore(blob:Blob):Promise<RestorePreview>{try{const a=await parseArchive(blob);return {version:1,taskCount:a.data.tasks.length,fileCount:a.data.files.length,errors:[],conflicts:[]}}catch(e){return {version:0,taskCount:0,fileCount:0,errors:[e instanceof Error?e.message:'任务包无效'],conflicts:[]}}}
export async function writeSnapshot(data:unknown){const r=await fetch('/api/snapshot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw new Error(result.error||'本机备份失败');return result}
export async function restoreTaskArchive(blob:Blob,mode:'new-copy'|'replace',d:ReportDatabase=db,snapshot:(data:unknown)=>Promise<unknown>=writeSnapshot):Promise<string>{
 const a=await parseArchive(blob);if(!a.data.tasks.length)throw new Error('快照中没有可恢复任务')
 await snapshot(await taskArchiveObject(undefined,d))
 const oldId=a.data.tasks[0].id
 if(mode==='new-copy'){
  const ids=new Map<string,string>();for(const name of archiveTables)for(const row of a.data[name])if(name!=='reviews')ids.set(row.id,uid())
  const remap=(v:any):any=>typeof v==='string'?(ids.get(v)||v):v instanceof Uint8Array?v:Array.isArray(v)?v.map(remap):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[ids.get(k)||k,remap(x)])):v
  a.data=remap(a.data)
 }
 await d.transaction('rw',archiveTables.map(n=>d.table(n)),async()=>{
  if(mode==='replace'){
   for(const task of a.data.tasks){const ps=await d.proposals.where('reportId').equals(task.id).primaryKeys();await d.reviews.bulkDelete(ps)
    for(const name of archiveTables)if(name==='tasks')await d.tasks.delete(task.id);else if(name!=='reviews')await d.table(name).where('reportId').equals(task.id).delete()
   }
  }
  for(const name of archiveTables)if(a.data[name].length)await d.table(name).bulkAdd(a.data[name])
 })
 return a.data.tasks[0].id
}
