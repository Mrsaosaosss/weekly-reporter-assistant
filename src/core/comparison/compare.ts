import {db,type ReportDatabase} from '../../data/database'
import {uid,now,type CandidateSnapshot,type ParsedReport,type Difference,type FieldKey} from '../model'
import {normalize} from '../report/match'
import {prepareExport} from '../report/export'
export async function getLatestSnapshot(reportId:string,d:ReportDatabase=db){return (await d.snapshots.where('reportId').equals(reportId).sortBy('frozenAt')).at(-1)}
export async function freezeCandidate(reportId:string,d:ReportDatabase=db):Promise<CandidateSnapshot>{
 const task=await d.tasks.get(reportId),ps=await d.proposals.where('reportId').equals(reportId).toArray();if(task?.reviewMode!=='manual'&&!ps.length)throw new Error('请先生成候选建议')
 const items=structuredClone(await d.items.where('reportId').equals(reportId).toArray()),plan=await prepareExport(reportId,d)
 if(plan.blockers.length)throw new Error(plan.blockers.join('；'))
 for(const change of plan.changes)for(const item of items){const ref=item.targets[change.field];if(item.id===change.itemId||(ref&&change.ref&&ref.fileId===change.ref.fileId&&ref.sheet===change.ref.sheet&&ref.address===change.ref.address))item.fields[change.field]=change.finalText}
 const files=await d.files.where('reportId').equals(reportId).filter(f=>f.role!=='validation').toArray()
 const snapshot:CandidateSnapshot={id:uid(),reportId,items,aiReviewedCount:plan.aiReviewedCount,inputDigests:files.map(f=>f.digest),batchIds:task?.reviewMode==='manual'?['manual-issue-review']:[...new Set(ps.map(p=>p.batchId))],frozenAt:now()}
 await d.snapshots.add(snapshot);return snapshot
}
export function compareCandidate(snapshot:CandidateSnapshot,reference:ParsedReport):Difference[]{
 const differences:Difference[]=[],used=new Set<string>()
 const add=(itemId:string,type:Difference['type'],before:string,after:string)=>differences.push({id:uid(),reportId:snapshot.reportId,itemId,type,before,after,sourceIds:[]})
 for(const item of snapshot.items){
  const exact=reference.items.filter(r=>r.category===item.category&&normalize(r.unit)===normalize(item.unit)&&normalize(r.project)===normalize(item.project)&&normalize(r.taskPath.join(' '))===normalize(item.taskPath.join(' ')))
  if(exact.length!==1){add(item.id,'unverified',`${item.unit} / ${item.project} / ${item.taskPath.join('/')}`,'事项归属无法唯一匹配，请核实名称、单位或任务拆分');continue}
  const target=exact[0];used.add(target.id)
  for(const key of new Set([...Object.keys(item.fields),...Object.keys(target.fields)]) as Set<FieldKey>){
   if(['unit','project','content','work'].includes(key))continue
   const left=item.fields[key]||'',right=target.fields[key]||''
   if(left.replace(/\s/g,'')===right.replace(/\s/g,''))continue
   const nums=(s:string)=>s.match(/\d+(?:\.\d+)?/g)?.join('|')||''
   const type:Difference['type']=key==='status'?'status':key==='deadline'?'date':!left?'missing':!right?'extra':nums(left)!==nums(right)?'facts':'wording'
   add(item.id,type,`${key}: ${left}`,`${key}: ${right}`)
  }
 }
 for(const item of reference.items)if(!used.has(item.id))add(item.id,'unverified','人工版独有或尚未匹配的事项',`${item.unit} / ${item.project} / ${item.taskPath.join('/')}`)
 return differences
}
