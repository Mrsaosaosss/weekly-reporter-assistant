import {upgradeTaskStructure} from '../../data/upgradeTaskStructure'
import {db,type ReportDatabase} from '../../data/database'
import {uid,now,type Proposal,type FieldKey} from '../model'
import type {AIProvider} from './provider'
import {buildAnalysisInput} from './context'
import {validateAIResult} from './response'
import {mergeHistory,validateProposal} from '../report/rules'
import {fingerprint} from '../workbook/read'
export async function generateSourceSuggestions(reportId:string,d:ReportDatabase=db){
 await upgradeTaskStructure(reportId,d)
 const task=await d.tasks.get(reportId);if(!task||task.status==='archived')throw new Error('本期不存在或已归档')
 const items=await d.items.where('reportId').equals(reportId).toArray(),sources=await d.fragments.where('reportId').equals(reportId).toArray(),matches=await d.matches.where('reportId').equals(reportId).toArray()
 await d.transaction('rw',[d.proposals,d.reviews,d.tasks],async()=>{
  const existing=await d.proposals.where('reportId').equals(reportId).toArray()
  for(const item of items.filter(i=>i.category!=='todo')){
   const m=matches.find(m=>m.itemId===item.id),related=sources.filter(s=>m?.sourceIds.includes(s.id))
   const fields=Object.keys(item.targets).filter(k=>!['unit','project','description','content','work'].includes(k)) as FieldKey[]
   for(const field of fields){
    const old=existing.find(p=>p.itemId===item.id&&p.field===field);if(old)continue
    const values=[...new Set(related.map(s=>s.fields[field]).filter((t):t is string=>!!t?.trim()))]
    const before=item.fields[field]||''
    if(!values.length&&!['current','next','status'].includes(field))continue
    const text=values.length?(field==='history'?mergeHistory(before,values[0]):values[0]):before
    if(text===before&&values.length&&!['current','next','status'].includes(field))continue
    const p:Proposal={id:uid(),reportId,itemId:item.id,field,before,suggested:text,sourceIds:related.filter(s=>s.fields[field]).map(s=>s.id),warnings:[],batchId:'source-extract',baseRevision:task.revision}
    if(!values.length)p.warnings.push('未找到本期字段报送，请明确保留口径或补充人工依据')
    if(m?.ambiguous)p.warnings.push('事项匹配存在歧义，请核对来源')
    if(values.length>1)p.warnings.push('多份来源表述不同，请核对后合并')
    p.warnings.push(...validateProposal(p,item,sources).map(i=>i.message));await d.proposals.put(p)
   }
  }
  await d.tasks.update(reportId,{status:task.activeReviewId?'analyzing':'review',updatedAt:now()})
 })
}
export async function runAnalysis(reportId:string,provider:AIProvider,signal:AbortSignal,d:ReportDatabase=db){
 const task=await d.tasks.get(reportId);if(!task||task.status==='archived')throw new Error('本期不存在或已归档')
 const running=await d.batches.where('reportId').equals(reportId).filter(b=>b.status==='running').count();if(running)throw new Error('已有分析运行；如页面曾关闭，请先重置中断批次')
 const items=await d.items.where('reportId').equals(reportId).toArray(),sources=await d.fragments.where('reportId').equals(reportId).toArray()
 const matches=await d.matches.where('reportId').equals(reportId).toArray()
 const inputs=buildAnalysisInput(items,sources,matches),id=uid();await d.tasks.update(reportId,{status:'analyzing'})
 try{
  let calls=0
  for(const input of inputs){
   if(signal.aborted)throw new Error('分析已取消，已生成内容保留')
   const digest=fingerprint(new TextEncoder().encode(JSON.stringify(input)))
   const done=await d.batches.where('reportId').equals(reportId).filter(b=>b.inputDigest===digest&&b.status==='complete').first();if(done)continue
   if(calls++>=30)throw new Error('已达到本次30个事项的分析上限，点击继续可处理剩余事项')
   const batchId=id+':'+calls;input.batchId=batchId;input.baseRevision=task.revision
   await d.batches.put({id:batchId,reportId,inputDigest:digest,rulesVersion:'1',model:'configured',status:'running',createdAt:now()})
   try{
    const proposals=validateAIResult(await provider.analyze(input,signal),input)
    await d.transaction('rw',[d.proposals,d.reviews,d.batches],async()=>{
     for(const p of proposals){const old=await d.proposals.where('itemId').equals(p.itemId).filter(x=>x.field===p.field).first();if(old){const review=await d.reviews.get(old.id);if(review&&['accept','edit','keep'].includes(review.decision))continue;await d.proposals.put({...p,id:old.id})}else await d.proposals.put(p)}
     await d.batches.update(batchId,{status:'complete'})
    })
   }catch(e){await d.batches.update(batchId,{status:signal.aborted?'cancelled':'failed',error:e instanceof Error?e.message:'分析失败'});throw e}
  }
 }finally{await d.tasks.update(reportId,{status:'review',updatedAt:now()})}
}
