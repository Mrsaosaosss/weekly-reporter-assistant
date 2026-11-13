import {isFormulaTarget} from '../core/workbook/formulaProtection'
import {bulkChanges} from '../core/report/bulkChanges'
import {db,type ReportDatabase} from './database'
import {now,type FieldKey,type ManualReviewState,type ReportItem} from '../core/model'
import {readWorkbook} from '../core/workbook/read'
import {emptyManualState,groupIssues,reviewFields,resolveIssueSource,sourceCandidates,sourceFieldExists,decisionOwner,targetKey} from '../core/report/issueReview'
import {upgradeTaskStructure} from './upgradeTaskStructure'
const tables=(d:ReportDatabase)=>[d.tasks,d.items,d.fragments,d.files,d.proposals,d.reviews,d.batches]
export async function initializeManualReview(id:string,d:ReportDatabase=db){
 await upgradeTaskStructure(id,d)
 await d.transaction('rw',tables(d),async()=>{
  const task=await d.tasks.get(id);if(!task)throw new Error('找不到周报任务')
  if(task.status==='archived')return
  if(task.reviewMode==='manual'){const items=await d.items.where('reportId').equals(id).toArray(),state=task.manualReview||emptyManualState(),completed=groupIssues(items).filter(g=>g.items.some(i=>state.completed.includes(i.id))).map(g=>g.id);if(JSON.stringify(completed)!==JSON.stringify(state.completed))await d.tasks.update(id,{manualReview:{...state,completed}});return}
  const state=emptyManualState(),items=await d.items.where('reportId').equals(id).toArray(),proposals=await d.proposals.where('reportId').equals(id).toArray()
  const sources=await d.fragments.where('reportId').equals(id).toArray()
  const previous=await d.reviews.toArray(),targets=new Map<string,typeof proposals>()
  for(const p of proposals){const item=items.find(i=>i.id===p.itemId);if(!item||item.category==='todo'||!reviewFields.includes(p.field)||!item.targets[p.field])continue;const key=targetKey(item,p.field);targets.set(key,[...(targets.get(key)||[]),p])}
  for(const entries of targets.values()){
   const confirmed=entries.map(p=>({p,r:previous.find(r=>r.proposalId===p.id)})).filter(x=>x.r&&['accept','edit','keep'].includes(x.r.decision))
   if(confirmed.some(x=>x.r!.decision==='keep'))continue
   const texts=[...new Set(confirmed.map(x=>x.r!.finalText))]
   if(!texts.length)continue
   if(texts.length>1||texts[0]===undefined){state.migrationNotes=[...(state.migrationNotes||[]),'旧版共享格人工决定有冲突或缺少已确认文字，已保留上期，请重新选择：'+entries[0].field+' / '+items.find(i=>i.id===entries[0].itemId)?.project];continue}
   const chosen=confirmed.find(x=>x.r!.decision==='edit')||confirmed[0]
   const p=chosen.p,item=items.find(i=>i.id===p.itemId)!,owner=decisionOwner(items,item,p.field)
   const source=chosen.r!.decision==='accept'?resolveIssueSource(item,sources,state,items).source:undefined
   if(chosen.r!.decision==='accept'&&(!source||!(chosen.r!.sourceIds||p.sourceIds).includes(source.id)||source.fields[p.field]!==texts[0])){
    state.migrationNotes=[...(state.migrationNotes||[]),'旧采用与当前来源映射不符，已保留上期：'+item.project]
    continue
   }
   state.decisions[owner]={...state.decisions[owner],[p.field]:{itemId:item.id,field:p.field,mode:source?'source':'edit',text:texts[0],sourceId:source?.id}}
  }
  await d.batches.where('reportId').equals(id).filter(b=>b.status==='running').modify({status:'cancelled',error:'已切换至人工整块审阅'})
  await d.tasks.update(id,{reviewMode:'manual',manualReview:state,activeReviewId:undefined,aiReviewCompletedRevision:undefined,status:'review',revision:task.revision+1,updatedAt:now()})
 })
}
export type CellSelection={itemId:string;field:FieldKey;mode:'source'|'edit'|'keep';text?:string}
export type ManualAction={kind:'add-source';sourceId:string;parentId?:string}|{kind:'remove-source';sourceId:string}|{kind:'adopt-changes'}|{kind:'cells';cells:CellSelection[]}|{kind:'source';itemId:string;sourceId:string}|{kind:'complete';issueId:string}|{kind:'restore';state:ManualReviewState}
export async function changeManualReview(id:string,expectedRevision:number,action:ManualAction,d:ReportDatabase=db){
 return d.transaction('rw',tables(d),async()=>{
  const task=await d.tasks.get(id);if(!task)throw new Error('任务不存在')
  if(task.status==='archived')throw new Error('本期已归档，请先开启修订')
  if(task.reviewMode!=='manual')throw new Error('请先进入按问题审阅')
  if(task.revision!==expectedRevision)throw new Error('内容已在其他页面变化，请刷新后再操作')
  const before=structuredClone(task.manualReview||emptyManualState());let state=structuredClone(before)
  const items=await d.items.where('reportId').equals(id).toArray(),sources=await d.fragments.where('reportId').equals(id).toArray(),groups=groupIssues(items)
  const invalidate=(item:ReportItem,field?:FieldKey)=>{state.completed=state.completed.filter(g=>!groups.find(x=>x.id===g)?.items.some(i=>i.id===item.id||(field&&targetKey(i,field)===targetKey(item,field))))}
  if(action.kind==='restore')state=structuredClone(action.state)
  if(action.kind==='remove-source')state.additions=(state.additions||[]).filter(a=>a.sourceId!==action.sourceId)
  if(action.kind==='add-source'){
   const source=sources.find(s=>s.id===action.sourceId)
   if(!source||!source.category||source.category==='todo')throw new Error('新增来源不存在或类别不适用')
   if(state.additions?.some(a=>a.sourceId===source.id))throw new Error('该事项已添加')
   if(items.some(i=>resolveIssueSource(i,sources,state,items).source?.id===source.id))throw new Error('该来源已对应上期事项')
   if(action.parentId){const parent=items.find(i=>i.id===action.parentId);if(!parent||parent.category!==source.category)throw new Error('归属问题不存在或类别不一致')}
   state.additions=[...(state.additions||[]),{sourceId:source.id,parentId:action.parentId}]
  }

  if(action.kind==='complete'){if(!groups.some(g=>g.id===action.issueId))throw new Error('问题不存在');state.completed=[...new Set([...state.completed,action.issueId])]}
  if(action.kind==='source'){
   const item=items.find(i=>i.id===action.itemId);if(!item)throw new Error('工作子项不存在')
   if(action.sourceId&&action.sourceId!=='none'&&!sourceCandidates(item,sources,items).some(s=>s.id===action.sourceId))throw new Error('来源与单位、项目、类别或独立子行不对应')
   if(action.sourceId)state.sources[item.id]=action.sourceId;else delete state.sources[item.id]
   for(const field of reviewFields){const owner=decisionOwner(items,item,field);for(const peer of items.filter(i=>targetKey(i,field)===targetKey(item,field)))if(state.decisions[peer.id])delete state.decisions[peer.id][field];invalidate(item,field)}
  }
  let adoptedCount:number|undefined,skippedCount:number|undefined
  if(action.kind==='cells'||action.kind==='adopt-changes'){
   const base=await d.files.where('reportId').equals(id).filter(f=>f.role==='baseline').first();if(!base)throw new Error('底稿缺失')
   const book=readWorkbook(Uint8Array.from(base.bytes).buffer,base.id),written=new Map<string,string>()
   const bulk=action.kind==='adopt-changes'?bulkChanges(items,sources,state,new Map([[base.id,book]])):undefined
   const selections=action.kind==='cells'?action.cells:bulk!.cells
   if(bulk){adoptedCount=selections.length;skippedCount=bulk.skipped}
   for(const input of selections){
    const item=items.find(i=>i.id===input.itemId),field=input.field
    if(!item||item.category==='todo'||!reviewFields.includes(field)||!item.targets[field])throw new Error('更新字段不存在')
    const ref=item.targets[field]!,owner=decisionOwner(items,item,field),key=targetKey(item,field)
    if(input.mode==='keep'){for(const peer of items.filter(i=>targetKey(i,field)===key))if(state.decisions[peer.id])delete state.decisions[peer.id][field];invalidate(item,field);continue}
    const source=resolveIssueSource(item,sources,state,items).source
    if(input.mode==='source'&&!sourceFieldExists(source,field))throw new Error('本期来源或字段未明确，请先选择来源')
    const text=input.mode==='source'?source!.fields[field]!:input.text
    if(typeof text!=='string')throw new Error('请填写编辑内容（可以明确留空）')
    if(text.length>32767)throw new Error('单元格文字超过Excel长度限制')
    if(ref.fileId!==base.id||!book.sheets.some(s=>s.name===ref.sheet))throw new Error('更新目标不属于当前底稿')
    if(isFormulaTarget(book,ref.sheet,ref.address))throw new Error('该格为公式，不能用文字替换')
    if(written.has(key)&&written.get(key)!==text)throw new Error('同一合并单元格有不同来源内容，请逐格确认')
    written.set(key,text)
    for(const peer of items.filter(i=>targetKey(i,field)===key))if(state.decisions[peer.id])delete state.decisions[peer.id][field]
    state.decisions[owner]={...state.decisions[owner],[field]:{itemId:item.id,field,mode:input.mode,text,sourceId:source?.id}}
    invalidate(item,field)
   }
  }
  const revision=task.revision+1
  await d.tasks.update(id,{manualReview:state,revision,status:'review',updatedAt:now()})
  return {before,revision,adoptedCount,skippedCount}
 })
}
