import {transientAIError} from './requestError'
import {db,type ReportDatabase} from '../../data/database'
import {now,uid,fieldLabels,type SourceFragment,type FieldKey} from '../model'
import {generateSourceSuggestions} from './runner'
import {prepareExport} from '../report/export'
import {normalize} from '../report/match'
import {fingerprint} from '../workbook/read'
import {validateReviewResponse,type CandidateReviewInput,type CandidateReviewProvider,type ReviewProgress,type AIReview} from './reviewContract'
export type {ReviewProgress} from './reviewContract'
const unitParts=(s:string)=>s.split(/[\n、，,；;]/).map(normalize).filter(Boolean)
const sharesUnit=(left:string,right:string)=>unitParts(left).some(a=>unitParts(right).includes(a))
interface Job {input:CandidateReviewInput;digest:string;available:SourceFragment[]}
export async function buildCandidateReviewJobs(reportId:string,d:ReportDatabase=db):Promise<Job[]>{
 const task=await d.tasks.get(reportId);if(!task)throw new Error('任务不存在')
 const [items,sources,mappings,proposals,reviews]=await Promise.all([d.items.where('reportId').equals(reportId).toArray(),d.fragments.where('reportId').equals(reportId).toArray(),d.mappings.where('reportId').equals(reportId).toArray(),d.proposals.where('reportId').equals(reportId).toArray(),d.reviews.toArray()])
 const plan=await prepareExport(reportId,d,{ignoreAIReview:true}),groups=new Map<string,typeof items>()
 for(const item of items.filter(i=>i.category!=='todo')){
  if(!proposals.some(p=>p.itemId===item.id&&!reviews.some(r=>r.proposalId===p.id&&r.decision!=='pending')))continue
  const key=item.category+':'+normalize(item.unit);groups.set(key,[...(groups.get(key)||[]),item])
 }
 const jobs:Job[]=[]
 for(const group of groups.values()){
  const first=group[0],available=sources.filter(s=>sharesUnit(s.unit,first.unit)&&task.dispositions?.[s.id]?.kind!=='exclude'&&s.refs.some(ref=>mappings.find(m=>m.fileId===ref.fileId)?.values.some(m=>m.sheet===ref.sheet&&m.category===first.category)))
  const add=(chunk:typeof items)=>{
   const input:CandidateReviewInput={mode:'candidate-review',meta:task.meta,items:chunk,sources:available,candidate:proposals.filter(p=>chunk.some(i=>i.id===p.itemId)&&!reviews.some(r=>r.proposalId===p.id&&r.decision!=='pending')).map(p=>{
    const change=plan.changes.find(c=>c.proposalId===p.id)
    return {proposalId:p.id,itemId:p.itemId,field:p.field,before:p.before,text:change?.finalText??p.before,reasons:plan.exceptions.filter(e=>e.itemId===p.itemId&&e.field===fieldLabels[p.field]).map(e=>e.reason).concat(p.warnings)}
   })}
   if(JSON.stringify(input).length>90000){
    input.sourceIndex=available.map(s=>({sourceId:s.id,project:s.project,taskPath:s.taskPath}));input.sources=[]
    const matched=new Set(proposals.filter(p=>chunk.some(i=>i.id===p.itemId)).flatMap(p=>p.sourceIds))
    const ordered=[...available].sort((a,b)=>Number(matched.has(b.id))-Number(matched.has(a.id)))
    for(const source of ordered){input.sources.push(source);if(JSON.stringify(input).length>85000)input.sources.pop()}
   }
   if(JSON.stringify(input).length>90000){if(chunk.length>1){const mid=Math.ceil(chunk.length/2);add(chunk.slice(0,mid));add(chunk.slice(mid));return}throw new Error(`${first.unit}的${chunk[0].project}相关材料过长，未截断或发送；请缩小材料范围`)}
   if(input.candidate.length)jobs.push({input,available,digest:fingerprint(new TextEncoder().encode(JSON.stringify({input,available,revision:task.revision,rules:'candidate-review-v1'})))})
  }
  for(let n=0;n<group.length;n+=3)add(group.slice(n,n+3))
 }
 return jobs
}
function narrowRetryInput(input:CandidateReviewInput,available:SourceFragment[]):CandidateReviewInput{
 const result:CandidateReviewInput={...input,sourceIndex:available.map(s=>({sourceId:s.id,project:s.project,taskPath:s.taskPath})),sources:[]}
 const preferred=new Set(input.sources.filter(s=>input.items.some(i=>normalize(i.project)===normalize(s.project))).map(s=>s.id))
 const ordered=[...input.sources].sort((a,b)=>Number(preferred.has(b.id))-Number(preferred.has(a.id)))
 for(const source of ordered){result.sources.push(source);if(JSON.stringify(result).length>90000||JSON.stringify(result).length>35000&&result.sources.length>1)result.sources.pop()}
 if(JSON.stringify(result).length>90000)throw new Error('单事项上下文仍过长，请缩小材料范围；内容未截断')
 return result
}
export async function runCandidateReview(reportId:string,provider:CandidateReviewProvider,signal:AbortSignal,onProgress:(p:ReviewProgress)=>void=()=>{},d:ReportDatabase=db):Promise<ReviewProgress>{
 const runId=uid()
 await d.transaction('rw',[d.tasks,d.batches],async()=>{
  const task=await d.tasks.get(reportId);if(!task||task.status==='archived')throw new Error('本期不存在或已归档')
  if(task.activeReviewId||task.status==='analyzing'||await d.batches.where('reportId').equals(reportId).filter(b=>b.status==='running').count())throw new Error('已有分析运行；若页面曾关闭，请重置中断复核再继续')
  await d.tasks.update(reportId,{status:'analyzing',activeReviewId:runId,aiReviewCompletedRevision:undefined})
 })
 const progress:ReviewProgress={completed:0,total:0,reviewedFields:0,resolvedFields:0,unresolvedFields:0,stage:'生成规则初稿'}
 let failure:unknown
 try{
  await generateSourceSuggestions(reportId,d)
  await d.transaction('rw',[d.items,d.proposals,d.tasks],async()=>{
   const items=await d.items.where('reportId').equals(reportId).toArray(),existing=await d.proposals.where('reportId').equals(reportId).toArray(),task=(await d.tasks.get(reportId))!
   for(const item of items.filter(i=>i.category!=='todo'))for(const field of Object.keys(item.targets) as FieldKey[]){
    if(['unit','project','description','content','work'].includes(field)||existing.some(p=>p.itemId===item.id&&p.field===field))continue
    await d.proposals.add({id:uid(),reportId,itemId:item.id,field,before:item.fields[field]||'',suggested:item.fields[field]||'',sourceIds:[],warnings:['规则阶段未提取该字段，交由AI根据原文复核'],batchId:'source-extract',baseRevision:task.revision})
   }
   await d.tasks.update(reportId,{status:'analyzing'})
  })
  const task=(await d.tasks.get(reportId))!,jobs=await buildCandidateReviewJobs(reportId,d);progress.total=jobs.length;onProgress({...progress})
  let cursor=0
  const counted=new Set<string>(),failed:string[]=[];progress.failedBatches=0;progress.retries=0
  const countAudits=(audits:AIReview[])=>{for(const a of audits){if(counted.has(a.proposalId))continue;counted.add(a.proposalId);if(a.by==='ai')progress.reviewedFields++;if(a.decision==='unresolved')progress.unresolvedFields++;else progress.resolvedFields++}onProgress({...progress})}
  async function worker(){
   while(cursor<jobs.length&&!failure){
    if(signal.aborted){failure=new Error('AI复核已取消，已完成结果保留，可继续剩余事项');return}
    const index=cursor++,job=jobs[index],current=await d.proposals.bulkGet(job.input.candidate.map(c=>c.proposalId))
    const cached=current.filter(p=>p?.aiReview?.inputDigest===job.digest&&p.aiReview.baseRevision===task.revision).map(p=>p!.aiReview!)
    countAudits(cached)
    const pending=job.input.candidate.filter(c=>!cached.some(a=>a.proposalId===c.proposalId))
    if(!pending.length){progress.stage='复用已完成复核';progress.completed++;onProgress({...progress});continue}
    const batchId=runId+':'+index
    await d.batches.put({id:batchId,reportId,inputDigest:job.digest,rulesVersion:'candidate-review-v1',model:'configured',kind:'review',status:'running',createdAt:now()})
    const noMaterial=!job.available.length
    async function save(decisions:ReturnType<typeof validateReviewResponse>){
     if(signal.aborted)throw new Error('AI复核已取消，已完成结果保留')
     const audits:AIReview[]=decisions.map(decision=>({...decision,inputDigest:job.digest,baseRevision:task.revision,reviewedAt:now(),by:noMaterial?'missing-material':'ai'}))
     await d.transaction('rw',[d.tasks,d.proposals,d.batches],async()=>{
      const active=await d.tasks.get(reportId),batch=await d.batches.get(batchId)
      if(active?.activeReviewId!==runId||active.revision!==task.revision||batch?.status!=='running')throw new Error('任务或复核状态已变化，本批未写入；请重新继续复核')
      for(const audit of audits)await d.proposals.update(audit.proposalId,{aiReview:audit})
     });countAudits(audits)
    }
    async function reviewWithSources(input:CandidateReviewInput){
     let reviewInput=input
     for(let round=0;round<3;round++){
      if(signal.aborted)throw new Error('AI复核已取消，已完成结果保留')
      const raw=await provider.review(reviewInput,signal),request=raw&&typeof raw==='object'?(raw as {requestedSourceIds?:unknown}).requestedSourceIds:undefined
      if(!request)return validateReviewResponse(raw,reviewInput)
      if(!Array.isArray(request)||!request.length||request.length>8||request.some(id=>typeof id!=='string'||!job.available.some(s=>s.id===id)))throw new Error('AI请求了不属于本期同单位同类别的来源')
      const wanted=job.available.filter(s=>request.includes(s.id)),other=reviewInput.sources.filter(s=>!request.includes(s.id))
      reviewInput={...reviewInput,sources:[...wanted]}
      if(JSON.stringify(reviewInput).length>90000)throw new Error('AI请求的原文过长，请分开复核；未截断内容')
      for(const s of other){reviewInput.sources.push(s);if(JSON.stringify(reviewInput).length>90000)reviewInput.sources.pop()}
     }
     throw new Error('AI仍在调取来源，尚未完成结论；可继续重试本批')
    }
    const pendingInput={...job.input,candidate:pending,items:job.input.items.filter(i=>pending.some(c=>c.itemId===i.id))}
    const label=job.input.items[0].unit+' · '+job.input.items[0].project
    async function run(input:CandidateReviewInput){
     progress.stage='正在复核 '+label;onProgress({...progress})
     const decisions=noMaterial?input.candidate.map(c=>({proposalId:c.proposalId,decision:['current','next'].includes(c.field)?'unresolved' as const:'keep' as const,text:c.before,reason:['current','next'].includes(c.field)?'未找到同单位、同类别的本期报送材料，不能将上期进展当作本期事实；保留原文待核实':'未报送新材料，该字段沿用上期既有档案，不作为本期新增事实',evidence:[]})):await reviewWithSources(input)
     await save(decisions)
    }
    try{
     try{await run(pendingInput)}catch(e){
      if(signal.aborted||!transientAIError(e))throw e
      progress.retries!++;progress.stage='响应较慢，拆小重试 '+label;onProgress({...progress})
      const pieces=pendingInput.items.map(item=>narrowRetryInput({...pendingInput,items:[item],candidate:pending.filter(c=>c.itemId===item.id)},job.available))
      let retryFailure:unknown
      for(const piece of pieces){
       try{await run(piece)}catch(error){if(signal.aborted||!transientAIError(error))throw error;retryFailure=error}
      }
      if(retryFailure)throw retryFailure
     }
     await d.batches.update(batchId,{status:'complete'});progress.completed++;onProgress({...progress})
    }catch(e){
     await d.batches.update(batchId,{status:signal.aborted?'cancelled':'failed',error:e instanceof Error?e.message:'复核失败'})
     if(!signal.aborted&&transientAIError(e)){failed.push(label);progress.failedBatches=failed.length;progress.stage='已保存未完成批次，继续其他事项';onProgress({...progress});continue}
     failure=e;return
    }
   }
  }
  await Promise.all([worker(),worker(),worker(),worker()]);if(failure)throw failure
  if(failed.length){progress.stage=`已保存全部可用结果，${failed.length}批仍需重试`;onProgress({...progress});throw new Error(`本次已完成 ${progress.completed}/${progress.total} 批，${failed.length} 批因服务超时或网络问题未完成。已完成结果和部分批次内已成功字段均已保存，请点击“继续AI复核并下载”仅重试未完成部分。`)}
  await d.transaction('rw',d.tasks,async()=>{const active=await d.tasks.get(reportId);if(active?.activeReviewId!==runId||active.revision!==task.revision)throw new Error('任务已变化，本次复核未标记完成；请继续复核');await d.tasks.update(reportId,{aiReviewCompletedRevision:task.revision})})
  progress.stage='本期复核完成';onProgress({...progress});return progress
 }finally{
  await d.transaction('rw',d.tasks,async()=>{if((await d.tasks.get(reportId))?.activeReviewId===runId)await d.tasks.update(reportId,{status:'review',activeReviewId:undefined,updatedAt:now()})})
 }
}
export async function resetCandidateReview(reportId:string,d:ReportDatabase=db){
 await d.transaction('rw',[d.tasks,d.batches],async()=>{
  const task=await d.tasks.get(reportId);if(!task||task.status==='archived')throw new Error('任务不可重置')
  await d.batches.where('reportId').equals(reportId).filter(b=>b.status==='running').modify({status:'cancelled',error:'用户重置中断复核'})
  await d.tasks.update(reportId,{status:'review',activeReviewId:undefined,updatedAt:now()})
 })
}
