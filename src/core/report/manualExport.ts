import {isFormulaTarget} from '../workbook/formulaProtection'
import {todoNotices} from '../workbook/todoProtection'
import type {ReportDatabase} from '../../data/database'
import {fieldLabels,type ReportItem,type FieldKey,uid} from '../model'
import {readWorkbook} from '../workbook/read'
import {updatedTodoRows,todoHasEmphasis} from '../workbook/todoUpdates'
import {sourceRoute} from './sourceMap'
import {selectedTodoSources} from '../workbook/replaceTodos'
import {sameText,normalizePlaceholder,emptyManualState,groupIssues,reviewFields,sourceFieldExists,targetKey,cellDecision,resolveIssueSource,physicalItems} from './issueReview'
import type {CandidatePlan} from './export'
export async function prepareManualExport(reportId:string,d:ReportDatabase):Promise<CandidatePlan>{
 const task=(await d.tasks.get(reportId))!,state=task.manualReview||emptyManualState()
 const files=await d.files.where('reportId').equals(reportId).toArray(),base=files.find(f=>f.role==='baseline');if(!base)throw new Error('原始底稿缺失')
 const items=await d.items.where('reportId').equals(reportId).toArray(),sources=await d.fragments.where('reportId').equals(reportId).toArray(),mappings=await d.mappings.where('reportId').equals(reportId).toArray(),maps=mappings.find(m=>m.fileId===base.id)?.values||[],book=readWorkbook(Uint8Array.from(base.bytes).buffer,base.id)
 const books=new Map([[base.id,book]])
 const orderedTodos=selectedTodoSources(task,files,sources,mappings)
 const oldTodos=items.filter(item=>item.category==='todo')
 const todoRows=updatedTodoRows(orderedTodos,oldTodos,row=>{
  const fileId='targets' in row?base.id:row.refs[0]?.fileId
  if(!fileId)return false
  let workbook=books.get(fileId)
  if(!workbook){
   const file=files.find(f=>f.id===fileId)
   if(!file)return false
   workbook=readWorkbook(Uint8Array.from(file.bytes).buffer,file.id)
   books.set(fileId,workbook)
  }
  const peers='targets' in row?oldTodos:orderedTodos.filter(source=>source.refs[0]?.fileId===fileId)
  return todoHasEmphasis(row,workbook,peers)
 },task.meta.periodStart)
 const plan:CandidatePlan={patches:[],insertions:[],warnings:[],blockers:[],exceptions:[],changes:[],appliedCount:0,heldCount:0,unchangedCount:0,aiReviewedCount:0,aiKeptCount:0,todoSheets:maps.filter(m=>m.category==='todo'),todoRows}
 if(!items.length)plan.blockers.push('底稿没有可读取的工作事项，请检查栏目映射')
 const seen=new Set<string>()
 for(const item of physicalItems(items).filter(i=>!!sourceRoute(i)))for(const field of reviewFields){
  const ref=item.targets[field],key=targetKey(item,field);if(!ref||seen.has(key))continue;seen.add(key)
  const before=item.fields[field]||'',decision=cellDecision(items,item,field,state);let text=before
  if(decision){
   const origin=items.find(i=>i.id===decision.itemId),source=sources.find(s=>s.id===decision.sourceId)
   let reason=''
   if(!origin||decision.field!==field||targetKey(origin,field)!==key||ref.fileId!==base.id)reason='人工选择的目标已变化，请重新审阅'
   else if(decision.mode==='source'&&(!source||resolveIssueSource(origin,sources,state,items).source?.id!==source.id||!sourceFieldExists(source,field)||source.fields[field]!==decision.text))reason='原选来源与当前映射不符，保留上期'
   else if(isFormulaTarget(book,ref.sheet,ref.address)&&decision.text!==before)reason='目标是公式格，保留原公式'
   if(reason){(decision.mode==='source'?plan.warnings:plan.blockers).push(`${item.project} / ${fieldLabels[field]}：${reason}`)}else text=decision.text
  }
  if(!isFormulaTarget(book,ref.sheet,ref.address))text=normalizePlaceholder(text)
  if(text!==before){
   const cell=book.sheets.find(s=>s.name===ref.sheet)?.cells[ref.address]
   const date1904=/date1904=["'](?:1|true)["']/.test(new TextDecoder().decode(book.parts['xl/workbook.xml']))
   const isDate=field==='deadline'&&cell?.type==='n'&&/^\d{4}-\d{2}-\d{2}$/.test(text)&&Number.isFinite(Date.parse(text))
   plan.patches.push({ref,before:cell?.text||'',text:isDate?String(Math.round((Date.parse(text)-(date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30)))/86400000)):text,textStyle:'confirmed-plain',valueType:isDate?'number':undefined,highlight:sameText(before,text)?undefined:'changed'});if(sameText(before,text))plan.unchangedCount++;else plan.appliedCount++
  }else plan.unchangedCount++
  plan.changes.push({proposalId:`manual:${item.id}:${field}`,itemId:item.id,unit:item.unit,project:item.project,field,before,finalText:text,sourceIds:decision?.sourceId?[decision.sourceId]:[],method:decision&&text===decision.text?(decision.mode==='edit'?'人工编辑':'人工采用本期'):'保留上期',note:'按问题整块人工审阅',ref})
 }
 for(const group of groupIssues(items.filter(i=>!!sourceRoute(i))))if(!state.completed.includes(group.id))plan.warnings.push(`${group.title} 尚未标记审阅完成，未选内容保留上期`)
 const used=new Set<string>()
 // Include automatic exact correspondence so unchanged sources are not misreported as new items.
 for(const item of items){const s=resolveIssueSource(item,sources,state,items).source;if(s)used.add(s.id)}
 plan.additions=[]
 for(const addition of state.additions||[]){
  const source=sources.find(s=>s.id===addition.sourceId),parent=addition.parentId?items.find(i=>i.id===addition.parentId):undefined
  if(!source||(addition.parentId&&!parent)){plan.blockers.push('新增事项来源或归属问题已缺失，请撤销添加后重新确认');continue}
  const targetSheet=parent&&Object.values(parent.targets)[0]?.sheet
  const possible=maps.filter(m=>m.category===source.category&&(!targetSheet||m.sheet===targetSheet))
  if(possible.length!==1){plan.blockers.push(`${source.project}新增目标工作表不唯一，请核对栏目映射`);continue}
  const mapping=possible[0]
  const missing=Object.entries(source.fields).filter(([f,t])=>t?.trim()&&normalizePlaceholder(t)!=='-'&&!mapping.columns[f as FieldKey]).map(([f])=>fieldLabels[f as FieldKey])
  if(missing.length){plan.blockers.push(`${source.project}新增内容缺少目标栏目：${missing.join('、')}，请补齐栏目映射后导出`);continue}
  const merged=parent?{...source,unit:parent.unit,project:parent.project,fields:{...source.fields,unit:parent.unit,project:parent.project,description:parent.fields.description||source.fields.description}}:source
  plan.additions.push({source:merged,mapping});used.add(source.id)
  plan.changes.push({proposalId:'addition:'+source.id,itemId:source.id,unit:merged.unit,project:merged.project,field:'content',before:'',finalText:source.rawText,sourceIds:[source.id],method:'人工确认新增',note:parent?'归属已有问题，写入工作表末尾':'全新问题，写入工作表末尾'})
  plan.appliedCount++
 }
 for(const source of sources.filter(s=>s.category!=='todo'&&!used.has(s.id)))if(task.dispositions?.[source.id]?.kind!=='exclude')plan.exceptions.push({id:uid(),kind:'unmatched',unit:source.unit,project:source.project,field:'未采用或未匹配来源',location:source.refs.map(r=>`${r.sheet}!${r.address}`).join('；'),before:'未自动并入主表',suggested:source.rawText,sourceIds:[source.id],reason:'请核对是否为新增问题或其他版本；未自动写入'})
 for(const map of maps)for(const address of map.metadataTargets){const cell=book.sheets.find(s=>s.name===map.sheet)?.cells[address];if(cell&&!isFormulaTarget(book,map.sheet,address))plan.patches.push({ref:{fileId:base.id,sheet:map.sheet,address},before:cell.text,text:`${task.meta.periodStart.replace(/-/g,' / ')} 至 ${task.meta.periodEnd.replace(/-/g,' / ')}    第（${task.meta.weeklyIssue}）期`,textStyle:'confirmed-plain'})}
 plan.todoWarnings=todoNotices(book,plan.todoSheets,plan.todoRows.length)
 return plan
}
