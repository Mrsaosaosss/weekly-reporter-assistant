import {appendReviewed,type ReviewedAddition} from '../workbook/appendReviewed'
import {todoNotices,type TodoNotice} from '../workbook/todoProtection'
import {prepareManualExport} from './manualExport'
import {upgradeTaskStructure} from '../../data/upgradeTaskStructure'
import {selectedTodoSources,replaceTodoSheet} from '../workbook/replaceTodos'
import {rowCompatible,sourceInScope} from './correspondence'
import {db,type ReportDatabase} from '../../data/database'
import {uid,now,fieldLabels,type ExportPlan,type FieldKey,type Proposal,type CellRef} from '../model'
import {readWorkbook} from '../workbook/read'
import {patchWorkbook} from '../workbook/patch'
import {parseReport,suggestMappings} from './parse'
import {validateProposal} from './rules'
import {normalize} from './match'
import {createTableWorkbook} from './changeLog'
import {bytesBlob} from '../../ui/download'
export interface CandidateException {
 id:string;kind:'missing'|'conflict'|'unmatched'|'validation'|'analysis'|'layout';itemId?:string;
 unit:string;project:string;field:string;location:string;before:string;suggested:string;sourceIds:string[];reason:string;
}
export interface CandidateChange {proposalId:string;itemId:string;unit:string;project:string;field:FieldKey;before:string;finalText:string;sourceIds:string[];method:string;note:string;ref?:CellRef}
export interface CandidatePlan extends ExportPlan {additions?:ReviewedAddition[];todoWarnings?:TodoNotice[];exceptions:CandidateException[];changes:CandidateChange[];appliedCount:number;heldCount:number;unchangedCount:number;aiReviewedCount:number;aiKeptCount:number;todoRows:import('../model').SourceFragment[];todoSheets:import('../model').SheetMapping[]}
const meaningful=(s:string)=>!!s.trim()&&!/^[/／—\-\s]*$/.test(s)
const stateTables=(d:ReportDatabase)=>[d.tasks,d.files,d.items,d.proposals,d.reviews,d.fragments,d.matches,d.mappings,d.batches]
export async function prepareExport(reportId:string,d:ReportDatabase=db,options:{ignoreAIReview?:boolean}={}):Promise<CandidatePlan>{
 await upgradeTaskStructure(reportId,d)
 return d.transaction('r',stateTables(d),async()=>{
  const task=await d.tasks.get(reportId);if(!task)throw new Error('任务不存在')
  if(task.reviewMode==='manual')return prepareManualExport(reportId,d)
  const files=await d.files.where('reportId').equals(reportId).toArray(),baseline=files.find(f=>f.role==='baseline');if(!baseline)throw new Error('原始底稿缺失')
  const book=readWorkbook(Uint8Array.from(baseline.bytes).buffer,baseline.id)
  const allMappings=await d.mappings.where('reportId').equals(reportId).toArray()
  const items=await d.items.where('reportId').equals(reportId).toArray(),proposals=await d.proposals.where('reportId').equals(reportId).toArray(),reviews=await d.reviews.toArray(),sources=await d.fragments.where('reportId').equals(reportId).toArray(),matches=await d.matches.where('reportId').equals(reportId).toArray(),mappings=allMappings.find(m=>m.fileId===baseline.id)?.values||[]
  const todoSheets=mappings.filter(m=>m.category==='todo'),todoRows=selectedTodoSources(task,files,sources,allMappings)
  const plan:CandidatePlan={todoSheets,todoRows,patches:[],insertions:[],warnings:[],blockers:[],exceptions:[],changes:[],appliedCount:0,heldCount:0,unchangedCount:0,aiReviewedCount:options.ignoreAIReview?0:proposals.filter(p=>items.some(i=>i.id===p.itemId&&i.category!=='todo')&&p.aiReview?.baseRevision===task.revision&&p.aiReview.by==='ai').length,aiKeptCount:options.ignoreAIReview?0:proposals.filter(p=>items.some(i=>i.id===p.itemId&&i.category!=='todo')&&p.aiReview?.baseRevision===task.revision&&p.aiReview.by==='ai'&&p.aiReview.decision==='keep').length}
  if(new Set(mappings.map(m=>m.category)).size<5)plan.exceptions.push({id:uid(),kind:'validation',unit:'',project:'底稿工作表',field:'',location:'',before:'',suggested:'',sourceIds:[],reason:'底稿未识别全部5类工作表，未识别内容原样保留'})
  if(!items.length)plan.blockers.push('底稿没有识别到工作事项，请检查文件和栏目映射')
  const groups=new Map<string,{proposal:Proposal;change:CandidateChange;reasons:string[];manual:boolean;keep:boolean}[]>()
  for(const original of proposals){
   const audit=!options.ignoreAIReview&&original.aiReview?.baseRevision===task.revision?original.aiReview:undefined
   const review=reviews.find(r=>r.proposalId===original.id)
   const confirmed=review&&['accept','edit','keep'].includes(review.decision)
   const p=confirmed?{...original,suggested:review.finalText??original.suggested,sourceIds:review.sourceIds??original.sourceIds}:audit?{...original,suggested:audit.text,sourceIds:[...new Set(audit.evidence.map(e=>e.sourceId))],warnings:[]}:original
   const item=items.find(i=>i.id===p.itemId);if(!item||item.category==='todo')continue
   const r=reviews.find(r=>r.proposalId===p.id),ref=item.targets[p.field],match=matches.find(m=>m.itemId===item.id)
   const manual=!!r&&['accept','edit','keep'].includes(r.decision),keep=r?.decision==='keep'
   const finalText=keep?p.before:r?.decision==='edit'?r.finalText??p.before:p.suggested
   let reasons:string[]=[]
   if(r?.decision==='verify')reasons.push('已标记待核实')
   if(!manual){
    if(sources.filter(s=>p.sourceIds.includes(s.id)).some(s=>!rowCompatible(item,s,p.field)||!sourceInScope(s,item)))reasons.push('来源与独立子行或单位范围不一致，未跨行复制')
    if(audit?.decision==='unresolved')reasons.push((audit.by==='ai'?'AI待核实：':'缺报待核实：')+audit.reason)
    if(audit?.decision==='update'||!audit)reasons.push(...p.warnings,...validateProposal(p,item,sources).map(v=>v.message))
    if(audit&&audit.evidence.some(e=>!sources.some(s=>s.id===e.sourceId&&s.rawText.replace(/\s/g,'').includes(e.quote.replace(/\s/g,'')))))reasons.push('AI复核引用的原文已缺失或变化，请重新复核')
    if(!audit&&match?.ambiguous)reasons.push('事项对应关系存在歧义')
    if(sources.filter(s=>p.sourceIds.includes(s.id)).some(s=>!s.refs.some(ref=>allMappings.find(m=>m.fileId===ref.fileId)?.values.some(m=>m.sheet===ref.sheet&&m.category===item.category))))reasons.push('来源工作表类别与目标不一致或无法确认，需核实归属')
    const sourceTexts=[...new Set(sources.filter(s=>p.sourceIds.includes(s.id)).map(s=>s.fields[p.field]).filter((s):s is string=>!!s?.trim()))]
    if(!audit&&p.batchId==='source-extract'&&sourceTexts.length>1)reasons.push('不同来源对该字段的报送不一致')
   }
   if(r?.decision==='accept'&&validateProposal(p,item,sources).some(v=>v.severity==='error'))reasons.push('原确认结果的来源已缺失，保留上期内容')
   const change:CandidateChange={proposalId:p.id,itemId:item.id,unit:item.unit,project:item.project,field:p.field,before:p.before,finalText,sourceIds:p.sourceIds,method:manual?(keep?'人工保留':r?.decision==='edit'?'人工修改':'人工确认'):audit?(audit.by==='missing-material'?'沿用上期档案':audit.decision==='update'?'AI复核更新':audit.decision==='keep'?'AI确认保留':'AI待核实'):p.batchId==='source-extract'?'自动提取':'AI整理',note:r?.note||audit?.reason||'',ref}
   const key=ref?ref.sheet+'!'+ref.address:'missing:'+p.id
   groups.set(key,[...(groups.get(key)||[]),{proposal:p,change,reasons:[...new Set(reasons)],manual,keep}])
  }
  for(const entries of groups.values()){
   const first=entries[0],ref=first.change.ref,cell=ref?book.sheets.find(s=>s.name===ref.sheet)?.cells[ref.address]:undefined
   const differing=entries.filter(e=>e.change.finalText!==e.change.before)
   const kept=entries.some(e=>e.keep),manual=differing.filter(e=>e.manual&&!e.keep&&!e.reasons.length)
   let selected=manual.length?manual:entries.filter(e=>!e.reasons.length&&!e.keep)
   let reasons=[...new Set(entries.flatMap(e=>e.reasons))]
   if(new Set(selected.map(e=>e.change.finalText)).size>1){reasons.push('同一合并单元格出现不同更新，暂保留上期值');selected=[]}
   if(kept){selected=[];if(differing.length)reasons.push('同一单元格已有人工保留决定，其他建议未写入')}
   let chosen:typeof first|undefined=selected[0],text=chosen?.change.finalText??first.change.before
   if(!ref||ref.fileId!==baseline.id||!book.sheets.some(s=>s.name===ref.sheet)){reasons.push('更新目标位置无效，保留原表');chosen=undefined;text=first.change.before}
   if(cell?.formula&&text!==(cell.text||'')){reasons.push('目标是公式格，未用普通文字覆盖');chosen=undefined;text=first.change.before}
   const changed=!!chosen&&text!==first.change.before
   const retained=!chosen&&reasons.length>0&&(differing.length>0||meaningful(first.change.before)||entries.some(e=>e.reasons.some(r=>/冲突|不一致|歧义/.test(r))))
   if(ref&&book.sheets.some(s=>s.name===ref.sheet)&&ref.fileId===baseline.id&&(changed||retained)){
    const date1904=/date1904=["'](?:1|true)["']/.test(new TextDecoder().decode(book.parts['xl/workbook.xml']))
    const isDate=changed&&first.change.field==='deadline'&&cell?.type==='n'&&/^\d{4}-\d{2}-\d{2}$/.test(text)&&Number.isFinite(Date.parse(text))
    const patchText=changed?(isDate?String(Math.round((Date.parse(text)-(date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30)))/86400000)):text):(cell?.text||'')
    plan.patches.push({ref,before:cell?.text||'',text:patchText,textStyle:'confirmed-plain',valueType:isDate?'number':undefined,highlight:changed?'changed':'attention'})
   }
   if(changed)plan.appliedCount++;else if(retained)plan.heldCount++;else plan.unchangedCount++
   for(const entry of entries)plan.changes.push({...entry.change,finalText:text,method:changed?(chosen?.change.method||entry.change.method):kept?'人工保留':retained?'异常保留上期':'未变更',note:retained?reasons.join('；'):entry.change.note})
   if(retained)plan.exceptions.push({id:uid(),kind:entries.some(e=>!e.proposal.sourceIds.length)?'missing':'conflict',itemId:first.change.itemId,unit:first.change.unit,project:first.change.project,field:fieldLabels[first.change.field],location:ref?`${ref.sheet}!${ref.address}`:'',before:first.change.before,suggested:[...new Set(entries.map(e=>e.change.finalText))].join('\n---\n'),sourceIds:[...new Set(entries.flatMap(e=>e.change.sourceIds))],reason:reasons.join('；')})
   if(changed&&text.length>Math.max(200,first.change.before.length*1.2))plan.warnings.push(`${ref?.sheet}!${ref?.address}文字增长，建议检查行高和打印预览`)
  }
  for(const item of items.filter(i=>i.category!=='todo'&&!proposals.some(p=>p.itemId===i.id))){
   if(!Object.entries(item.fields).some(([f,t])=>['current','next','history','status'].includes(f)&&meaningful(t||'')))continue
   plan.exceptions.push({id:uid(),kind:'missing',itemId:item.id,unit:item.unit,project:item.project,field:'整项',location:'',before:'上期内容已保留',suggested:'',sourceIds:[],reason:'尚无本期更新结果，原项完整保留'})
  }
  const mapped=new Set([...matches.flatMap(m=>m.sourceIds),...proposals.flatMap(p=>!options.ignoreAIReview&&p.aiReview?.baseRevision===task.revision&&p.aiReview.decision!=='unresolved'?p.aiReview.evidence.map(e=>e.sourceId):[])])
  for(const source of sources){
   if(source.category==='todo'||source.refs.some(ref=>allMappings.some(m=>m.fileId===ref.fileId&&m.values.some(v=>v.sheet===ref.sheet&&v.category==='todo'))))continue
   const disposition=task.dispositions?.[source.id]
   if(disposition?.kind==='exclude')continue
   if(mapped.has(source.id)&&disposition?.kind!=='appendix')continue
   plan.exceptions.push({id:uid(),kind:'unmatched',unit:source.unit,project:source.project,field:'新增或未匹配事项',location:source.refs.map(r=>`${r.sheet}!${r.address}`).join('；'),before:'未在主表自动插入',suggested:source.rawText,sourceIds:[source.id],reason:disposition?.reason||task.exclusions[source.id]||'未能唯一对应底稿事项，请在Excel中核对是否新增；完整报送原文保存在此清单'})
  }
  for(const unit of task.expectedUnits){if(files.some(f=>f.role==='source'&&(normalize(f.unit)===normalize(unit)||normalize(f.name).includes(normalize(unit)))))continue;plan.exceptions.push({id:uid(),kind:'missing',unit,project:'报送材料',field:'',location:'',before:'相关上期内容保留',suggested:'',sourceIds:[],reason:'未发现该单位独立报送文件，请确认是否由其他单位代报'})}
  const batches=await d.batches.where('reportId').equals(reportId).toArray()
  if(batches.some(b=>b.kind!=='review'&&['running','failed','cancelled'].includes(b.status)))plan.exceptions.push({id:uid(),kind:'analysis',unit:'',project:'AI处理状态',field:'',location:'',before:'可用的来源提取及已完成结果保留',suggested:'',sourceIds:[],reason:'部分AI处理未完成，候选使用目前可用结果，可继续分析后重新下载'})
  for(const map of mappings)for(const address of map.metadataTargets){const cell=book.sheets.find(s=>s.name===map.sheet)?.cells[address];if(cell&&!cell.formula)plan.patches.push({ref:{fileId:baseline.id,sheet:map.sheet,address},before:cell.text,text:`${task.meta.periodStart.replace(/-/g,' / ')} 至 ${task.meta.periodEnd.replace(/-/g,' / ')}    第（${task.meta.weeklyIssue}）期`,textStyle:'confirmed-plain'})}
  plan.todoWarnings=todoNotices(book,plan.todoSheets,plan.todoRows.length)
  return plan
 })
}
export async function exportReport(reportId:string,d:ReportDatabase=db,options:{ignoreAIReview?:boolean;requireAIReview?:boolean}={}){
 return d.transaction('rw',[...stateTables(d),d.exports],async()=>{
  const task=await d.tasks.get(reportId);if(!task)throw new Error('任务不存在')
  if(task.reviewMode!=='manual'&&options.requireAIReview&&(task.status==='analyzing'||task.aiReviewCompletedRevision!==task.revision))throw new Error('本期AI复核尚未全部完成或任务已变化，请继续复核后下载修订稿')
  const plan=await prepareExport(reportId,d,options);if(plan.blockers.length)throw new Error(plan.blockers.join('；'))
  const files=await d.files.where('reportId').equals(reportId).toArray(),base=files.find(f=>f.role==='baseline')!,book=readWorkbook(Uint8Array.from(base.bytes).buffer,base.id),sources=await d.fragments.where('reportId').equals(reportId).toArray()
  let bytes=plan.additions?.length?appendReviewed(book,plan.additions,plan.patches):patchWorkbook(book,plan.patches)
  for(const map of plan.todoSheets)bytes=replaceTodoSheet(readWorkbook(Uint8Array.from(bytes).buffer,base.id),map,plan.todoRows)
  const sourceLocations=(ids:string[])=>ids.map(id=>sources.find(s=>s.id===id)?.refs.map(r=>`${files.find(f=>f.id===r.fileId)?.name||''} / ${r.sheet}!${r.address}`).join('；')||'').join('\n')
  const changes=createTableWorkbook(['单位','项目/事项','字段','原文','候选内容','处理方式','依据/说明','来源位置'],plan.changes.filter(c=>c.before!==c.finalText).map(c=>[c.unit,c.project,fieldLabels[c.field],c.before,c.finalText,c.method,c.note,sourceLocations(c.sourceIds)]))
  const exceptionBytes=createTableWorkbook(['单位','项目/事项','字段','主表位置','处理结果','原值','报送/建议原文','异常原因','来源位置'],plan.exceptions.map(e=>[e.unit,e.project,e.field,e.location,e.kind==='unmatched'?'未自动并入主表':'保留上期值',e.before,e.suggested,e.reason,sourceLocations(e.sourceIds)]))
  const proposals=await d.proposals.where('reportId').equals(reportId).toArray()
  const reviewLog=createTableWorkbook(['单位','项目/事项','字段','AI结论','AI最终文字','实际候选内容','判断依据','引用原文','来源位置'],proposals.filter(p=>task.reviewMode!=='manual'&&plan.changes.some(c=>c.proposalId===p.id)&&!options.ignoreAIReview&&p.aiReview?.baseRevision===task.revision&&p.aiReview.by==='ai').map(p=>{
   const a=p.aiReview!,item=plan.changes.find(c=>c.proposalId===p.id)
   return [item?.unit||'',item?.project||'',fieldLabels[p.field],a.decision==='update'?'更新':a.decision==='keep'?'确认保留':'待核实',a.text,item?.finalText||'',a.reason,a.evidence.map(e=>e.quote).join('；'),sourceLocations(a.evidence.map(e=>e.sourceId))]
  }))
  const todoWarnings=plan.todoWarnings||todoNotices(book,plan.todoSheets,plan.todoRows.length)
  const todoOrder=createTableWorkbook(['序号','单位','周例会时间','待办事项','完成情况','异常说明','备注','来源位置'],plan.todoRows.map((s,i)=>[String(i+1),s.unit,s.fields.meetingDate||'',s.fields.content||'',s.fields.status||'',s.fields.deviation||'',s.fields.remarks||'',sourceLocations([s.id])]))
  const partial=plan.exceptions.some(e=>e.kind==='unmatched'),revisionId=uid()
  await d.exports.add({id:revisionId,reportId,createdAt:now(),bytes,changes,exceptions:exceptionBytes,exceptionCount:plan.exceptions.length,taskRevision:task.revision,partial,kind:'candidate',todoWarnings,todoOrder,aiReviewLog:reviewLog,aiReviewedCount:plan.aiReviewedCount})
  if(task.status!=='archived')await d.tasks.update(reportId,{status:'ready',updatedAt:now()})
  return {todoWarnings,todoOrder:bytesBlob(todoOrder),todoCount:plan.todoRows.length,reviewLog:bytesBlob(reviewLog),aiReviewedCount:plan.aiReviewedCount,workbook:bytesBlob(bytes),changes:bytesBlob(changes),exceptions:bytesBlob(exceptionBytes),exceptionCount:plan.exceptions.length,appliedCount:plan.appliedCount,heldCount:plan.heldCount,revisionId,partial}
 })
}
export async function finalizeReport(reportId:string,bytes:Uint8Array,fileName:string,d:ReportDatabase=db){
 if(!/\.xlsx$/i.test(fileName))throw new Error('请选择已在Excel中审阅的 .xlsx 定稿文件')
 const book=readWorkbook(Uint8Array.from(bytes).buffer,'final'),mappings=suggestMappings(book)
 if(new Set(mappings.map(m=>m.category)).size<5||!parseReport(book,mappings).items.length)throw new Error('定稿需保留5类工作表及可读取的工作事项，请检查是否选错文件')
 return d.transaction('rw',[d.tasks,d.exports],async()=>{
  const task=await d.tasks.get(reportId);if(!task||task.status==='archived')throw new Error('请先开启本期修订再上传定稿')
  const latest=(await d.exports.where('reportId').equals(reportId).sortBy('createdAt')).at(-1);if(!latest)throw new Error('请先生成一次候选稿以保留更新记录')
  const revision=task.revision+1,id=uid()
  await d.exports.add({id,reportId,createdAt:now(),bytes,changes:latest.changes,exceptions:latest.exceptions,exceptionCount:latest.exceptionCount,aiReviewLog:latest.aiReviewLog,aiReviewedCount:latest.aiReviewedCount,taskRevision:revision,partial:false,kind:'final',todoWarnings:latest.todoWarnings,todoOrder:latest.todoOrder,fileName})
  await d.tasks.update(reportId,{status:'archived',revision,updatedAt:now()});return id
 })
}
