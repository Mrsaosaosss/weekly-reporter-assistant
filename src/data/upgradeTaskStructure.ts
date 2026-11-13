import {db,type ReportDatabase} from './database'
import {readWorkbook,rowNumber} from '../core/workbook/read'
import {parseReport,suggestMappings} from '../core/report/parse'
import {bindSourceFragments} from '../core/report/sourceBinding'
import {groupIssues,resolveIssueSource} from '../core/report/issueReview'
import {matchItems} from '../core/report/match'
import {rowCompatible} from '../core/report/correspondence'
import {mergeHistory,validateProposal} from '../core/report/rules'
import {uid,type CellRef,type FieldKey,type SourceFragment,type ReportItem} from '../core/model'
const key=(refs:CellRef[])=>refs.length?refs[0].fileId+'|'+refs[0].sheet+'|'+Math.max(...refs.map(r=>rowNumber(r.address))):''
export async function upgradeTaskStructure(reportId:string,d:ReportDatabase=db){
 const task=await d.tasks.get(reportId);if(!task||task.structureVersion===3||task.status==='archived')return
 await d.transaction('rw',[d.tasks,d.files,d.items,d.fragments,d.mappings,d.matches,d.proposals,d.reviews],async()=>{
  const current=await d.tasks.get(reportId);if(!current||current.structureVersion===3||current.status==='archived')return
  const files=await d.files.where('reportId').equals(reportId).toArray(),oldItems=await d.items.where('reportId').equals(reportId).toArray(),oldSources=await d.fragments.where('reportId').equals(reportId).toArray(),maps=await d.mappings.where('reportId').equals(reportId).toArray(),reviews=await d.reviews.toArray()
  const items:ReportItem[]=[],sources:(SourceFragment&{reportId:string})[]=[]
  for(const file of files.filter(f=>f.role!=='validation')){
   const book=readWorkbook(Uint8Array.from(file.bytes).buffer,file.id),saved=maps.find(m=>m.fileId===file.id),suggested=suggestMappings(book)
   const values=(saved?.values||suggested).map(map=>{const auto=suggested.find(a=>a.sheet===map.sheet);if(map.category==='batch'&&auto?.headerRow===map.headerRow)return {...map,columns:{...map.columns,supplier:map.columns.supplier??auto.columns.supplier}};return map.category==='todo'&&auto?.headerRow===map.headerRow?{...map,sequenceColumn:auto.sequenceColumn,columns:{...map.columns,meetingDate:auto.columns.meetingDate,remarks:auto.columns.remarks}}:map})
   const parsed=parseReport(book,values),boundFile={...file,unit:file.unit||parsed.reportingUnit||''};await d.files.update(file.id,{unit:boundFile.unit})
   if(saved)await d.mappings.update(saved.id,{values})
   if(file.role==='baseline')for(const item of parsed.items){const old=oldItems.find(i=>key(Object.values(i.targets))===key(Object.values(item.targets)));items.push({...item,id:old?.id||item.id,reportId})}
   else for(const source of bindSourceFragments(parsed,boundFile)){const old=oldSources.find(s=>key(s.refs)===key(source.refs));sources.push({...source,id:old?.id||source.id,reportId})}
  }
  await d.items.where('reportId').equals(reportId).delete();await d.fragments.where('reportId').equals(reportId).delete()
  await d.items.bulkPut(items);await d.fragments.bulkPut(sources)
  const matches=matchItems(items.filter(i=>i.category!=='todo'),sources.filter(s=>s.category!=='todo'))
  const previous=await d.matches.where('reportId').equals(reportId).toArray();await d.matches.where('reportId').equals(reportId).delete()
  for(const match of matches){const old=previous.find(m=>m.itemId===match.itemId);if(old?.reason==='人工关联')Object.assign(match,{sourceIds:old.sourceIds.filter(id=>sources.some(s=>s.id===id)),ambiguous:false,reason:old.reason});await d.matches.put({...match,id:old?.id||uid(),reportId})}
  for(const p of await d.proposals.where('reportId').equals(reportId).toArray()){
   if(reviews.some(r=>r.proposalId===p.id&&['accept','edit','keep'].includes(r.decision)))continue
   const item=items.find(i=>i.id===p.itemId);if(!item||item.category==='todo')continue
   const related=sources.filter(s=>matches.find(m=>m.itemId===item.id)?.sourceIds.includes(s.id)),values=[...new Set(related.map(s=>s.fields[p.field]).filter((s):s is string=>s!==undefined&&!!s.trim()))]
   const suggested=values.length?(p.field==='history'?mergeHistory(p.before,values[0]):values[0]):p.before
   const next={...p,suggested,sourceIds:related.filter(s=>s.fields[p.field]!==undefined).map(s=>s.id),warnings:[] as string[]}
   if(!values.length)next.warnings.push('未找到本期字段报送')
   if(matches.find(m=>m.itemId===item.id)?.ambiguous)next.warnings.push('事项匹配存在歧义')
   next.warnings.push(...validateProposal(next,item,sources).map(i=>i.message))
   if(p.aiReview?.evidence.some(e=>{const s=sources.find(s=>s.id===e.sourceId);return !s||!rowCompatible(item,s,p.field)}))next.aiReview=undefined
   await d.proposals.put(next)
  }
  const manualReview=current.manualReview
  if(manualReview){
   const itemsById=new Map(items.map(item=>[item.id,item]))
   const resolved=new Map<string,SourceFragment|undefined>()
   const reopened=new Set<string>()
   let removed=0
   for(const fields of Object.values(manualReview.decisions))for(const decision of Object.values(fields)){
    if(decision.mode!=='source')continue
    const item=itemsById.get(decision.itemId)
    if(item&&!resolved.has(item.id))resolved.set(item.id,resolveIssueSource(item,sources,manualReview,items).source)
    const source=resolved.get(decision.itemId)
    if(!source||source.id!==decision.sourceId||source.fields[decision.field]!==decision.text){
     delete fields[decision.field]
     reopened.add(decision.itemId)
     removed++
    }
   }
   manualReview.sources={}
   const reopenGroups=new Set(groupIssues(items).filter(g=>g.items.some(item=>reopened.has(item.id))).map(g=>g.id))
   manualReview.completed=manualReview.completed.filter(id=>!reopenGroups.has(id))
   if(removed)manualReview.migrationNotes=[...(manualReview.migrationNotes||[]),`来源映射升级后，${removed} 处旧采用与新映射不一致，已撤回旧采用。可采用新映射找到的差异。`]
  }
  await d.tasks.update(reportId,{structureVersion:3,revision:current.revision+1,manualReview,aiReviewCompletedRevision:undefined})
 })
}
