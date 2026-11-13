import {AIRequestError} from './requestError'
import type {CandidateReviewInput,CandidateReviewProvider} from './reviewContract'
import type {ReportItem,SourceFragment} from '../model'
export interface AnalysisInput {items:ReportItem[];sources:SourceFragment[];batchId:string;baseRevision:number}
export interface AIResult {proposals:{itemId:string;field:string;text:string;sourceIds:string[]}[]}
export interface AIProvider {analyze(input:AnalysisInput,signal:AbortSignal):Promise<AIResult>}
export class LocalDeepSeekProvider implements AIProvider,CandidateReviewProvider {
 async review(input:CandidateReviewInput,signal:AbortSignal):Promise<unknown>{
  const body=JSON.stringify(input),cancel=()=>new AIRequestError('AI复核已暂停，已完成结果保留','AI_CANCELLED')
  if(signal.aborted)throw cancel()
  let response:Response,data:unknown
  try{
   response=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body,signal})
   try{data=await response.json()}catch(e){if(!response.ok)throw new AIRequestError('AI服务暂未返回有效响应（'+response.status+'）','AI_HTTP_'+response.status,response.status===429||response.status>=500);throw e}
  }catch(e){
   if(signal.aborted)throw cancel()
   if(e instanceof TypeError)throw new AIRequestError('连接AI服务暂时失败，将重试；已完成结果保留','AI_NETWORK',true)
   throw e
  }
  if(!response.ok){const payload=data&&typeof data==='object'?data as Record<string,unknown>:{};throw new AIRequestError(typeof payload.error==='string'?payload.error:'AI复核失败',typeof payload.code==='string'?payload.code:'AI_HTTP_'+response.status,payload.retryable===true||response.status===429||response.status>=500)}
  return data
 }

 async analyze(input:AnalysisInput,signal:AbortSignal):Promise<AIResult>{const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal});const data=await r.json();if(!r.ok)throw new Error(data.error||'分析失败');return data}
}
