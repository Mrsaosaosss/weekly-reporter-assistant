import {bindSourceFragments} from '../core/report/sourceBinding'
import {db,type ReportDatabase} from './database'
import {uid,now,validateReportMeta,type ReportMeta,type ImportInput,type ReportTask,type SheetMapping,type FileAsset,type ReportItem,type SourceFragment} from '../core/model'
import {readWorkbook} from '../core/workbook/read'
import {parseReport,suggestMappings} from '../core/report/parse'
import {matchItems} from '../core/report/match'
export async function createTask(meta:ReportMeta,inputs:ImportInput[],expectedUnits:string[],d:ReportDatabase=db,overrides:Record<string,SheetMapping[]>={}):Promise<ReportTask>{
 const errors=validateReportMeta(meta);if(errors.length)throw new Error(errors.map(x=>x.message).join('；'))
 if(inputs.filter(f=>f.role==='baseline').length!==1)throw new Error('请选择唯一一份上期底稿')
 if(inputs.some(f=>f.role==='validation'))throw new Error('人工对照版不能用于首次生成')
 const id=uid(),warnings:ReportTask['warnings']=[]
 const files:FileAsset[]=[],items:ReportItem[]=[],fragments:(SourceFragment&{reportId:string})[]=[],maps:{id:string;reportId:string;fileId:string;values:SheetMapping[]}[]=[]
 for(const input of inputs){
  if(!/\.xlsx$/i.test(input.name))throw new Error('仅支持未加密的 .xlsx 文件')
  const fileId=uid(),book=readWorkbook(input.bytes.buffer.slice(input.bytes.byteOffset,input.bytes.byteOffset+input.bytes.byteLength) as ArrayBuffer,fileId)
  if(files.some(f=>f.digest===book.digest))throw new Error(`文件内容重复：${input.name}`)
  if(input.role==='source'&&input.targetUnits!==undefined&&(!input.unit.trim()||!input.targetUnits.length))throw new Error('请为每份材料选择报送单位和对应的汇总表单位')
  const mapping=overrides[input.name]||suggestMappings(book),parsed=parseReport(book,mapping)
  if(input.role==='baseline'&&new Set(mapping.map(m=>m.category)).size<5)warnings.push({code:'baseline-sheets',severity:'warning',message:'底稿未覆盖全部5类工作表，请核对映射'})
  warnings.push(...parsed.warnings.map(w=>({...w,message:input.name+'：'+w.message})))
  files.push({id:fileId,reportId:id,name:input.name,role:input.role,unit:input.unit||parsed.reportingUnit||'',targetUnits:input.targetUnits,todoSource:input.todoSource,digest:book.digest,bytes:input.bytes,supersedes:input.supersedes})
  if(input.role==='baseline')items.push(...parsed.items.map(i=>({...i,reportId:id})))
  else {const bound=bindSourceFragments(parsed,files.at(-1)!);if(bound.length<parsed.fragments.length)warnings.push({code:'unit-scope',severity:'warning',message:`${input.name}：其他单位的${parsed.fragments.length-bound.length}行不纳入本期更新`});fragments.push(...bound.map(f=>({...f,reportId:id})))}
  maps.push({id:uid(),reportId:id,fileId,values:mapping})
 }
 const task:ReportTask={id,meta,status:'draft',expectedUnits,sourceFileIds:files.map(f=>f.id),revision:0,createdAt:now(),updatedAt:now(),warnings,exclusions:{},metadataConfirmed:false,structureVersion:3}
 await d.transaction('rw',[d.tasks,d.files,d.items,d.fragments,d.mappings,d.matches],async()=>{
  await d.tasks.add(task);await d.files.bulkAdd(files);if(items.length)await d.items.bulkAdd(items);if(fragments.length)await d.fragments.bulkAdd(fragments);await d.mappings.bulkAdd(maps)
  await d.matches.bulkAdd(matchItems(items,fragments).map(m=>({...m,id:uid(),reportId:id})))
 })
 return task
}
export async function loadTask(id:string,d:ReportDatabase=db){const task=await d.tasks.get(id);if(!task)throw new Error('找不到周报任务');return task}
export async function createNextTask(taskId:string,meta:ReportMeta,d:ReportDatabase=db){
 const task=await loadTask(taskId,d);if(task.status!=='archived')throw new Error('请先确认归档上一期')
 const revisions=await d.exports.where('reportId').equals(taskId).sortBy('createdAt'),last=revisions.at(-1)
 if(!last||last.partial)throw new Error('上一期尚无完整导出结果')
 return createTask(meta,[{name:`总第${task.meta.totalIssue}期.xlsx`,bytes:last.bytes,role:'baseline',unit:''}],task.expectedUnits,d)
}
export async function prepareNextTaskImport(taskId:string,d:ReportDatabase=db):Promise<{meta:ReportMeta;inputs:ImportInput[];expectedUnits:string[]}>{
 const task=await loadTask(taskId,d),last=(await d.exports.where('reportId').equals(taskId).sortBy('createdAt')).at(-1)
 if(task.status!=='archived'||!last||last.partial||last.taskRevision!==task.revision)throw new Error('上一期需要完整导出并确认归档后才能续期')
 const start=new Date(task.meta.periodEnd+'T00:00:00Z');start.setUTCDate(start.getUTCDate()+1);const end=new Date(start);end.setUTCDate(end.getUTCDate()+6);const issue=new Date(end);issue.setUTCDate(issue.getUTCDate()+1)
 return {meta:{totalIssue:task.meta.totalIssue+1,weeklyIssue:task.meta.weeklyIssue+1,periodStart:start.toISOString().slice(0,10),periodEnd:end.toISOString().slice(0,10),issueDate:issue.toISOString().slice(0,10)},inputs:[{name:`总第${task.meta.totalIssue}期_已确认底稿.xlsx`,bytes:last.bytes,role:'baseline',unit:''}],expectedUnits:task.expectedUnits}
}
export async function setSourceDisposition(reportId:string,sourceId:string,kind:'exclude'|'appendix',reason:string,d:ReportDatabase=db){
 if(!reason.trim())throw new Error('请填写处置原因')
 await d.transaction('rw',[d.tasks,d.fragments],async()=>{const task=await loadTask(reportId,d),source=await d.fragments.get(sourceId);if(task.status==='archived'||source?.reportId!==reportId)throw new Error('来源不存在或本期已归档');await d.tasks.update(reportId,{exclusions:{...task.exclusions,[sourceId]:reason},dispositions:{...task.dispositions,[sourceId]:{kind,reason}},revision:task.revision+1,updatedAt:now()})})
}
