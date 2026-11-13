import {db,type ReportDatabase} from './database'
import {now,type ReviewCommand,type ReviewRecord} from '../core/model'
import {validateProposal} from '../core/report/rules'
export async function applyReview(command:ReviewCommand,d:ReportDatabase=db):Promise<ReviewRecord>{
 return d.transaction('rw',[d.tasks,d.proposals,d.reviews,d.items,d.fragments],async()=>{
  const task=await d.tasks.get(command.reportId),original=await d.proposals.get(command.proposalId)
  const audit=task&&original?.aiReview?.baseRevision===task.revision?original.aiReview:undefined
  const p=original&&audit?{...original,suggested:audit.text,sourceIds:[...new Set(audit.evidence.map(e=>e.sourceId))]}:original
  if(!task||!p||p.reportId!==task.id)throw new Error('审核事项不存在')
  const old=await d.reviews.get(p.id)
  if((old?.revision||0)!==command.expectedRevision)throw new Error('审核已变化，请刷新比较，输入未保存')
  if(task.status==='archived')throw new Error('本期已归档，请先创建修订')
  if((p.warnings.length||!p.sourceIds.length||command.decision==='edit')&&['keep','accept','edit'].includes(command.decision)&&!command.note.trim())throw new Error('请填写审核依据或保留原因')
  if(command.decision==='accept'){
   const item=await d.items.get(p.itemId);const sources=await d.fragments.where('reportId').equals(task.id).toArray()
   if(!item||validateProposal(p,item,sources).some(x=>x.severity==='error'))throw new Error('建议缺少有效来源，请补充人工依据后编辑确认')
  }
  if(command.decision==='edit'&&!command.finalText?.trim())throw new Error('请填写最终内容；如保留空白请注明并选择保留原文')
  const record:ReviewRecord={proposalId:p.id,decision:command.decision,finalText:command.decision==='accept'?p.suggested:command.finalText,sourceIds:p.sourceIds,note:command.note,revision:(old?.revision||0)+1,updatedAt:now()}
  await d.reviews.put(record);await d.tasks.update(task.id,{revision:task.revision+1,status:'review',updatedAt:now()});return record
 })
}
