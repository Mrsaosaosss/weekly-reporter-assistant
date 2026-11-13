import {rowCompatible,sourceInScope} from '../report/correspondence'
import type {ReportItem,SourceFragment,FieldKey,ReportMeta} from '../model'
export interface ReviewEvidence {sourceId:string;quote:string}
export interface ReviewDecision {proposalId:string;decision:'update'|'keep'|'unresolved';text:string;reason:string;evidence:ReviewEvidence[]}
export interface AIReview extends ReviewDecision {inputDigest:string;baseRevision:number;reviewedAt:string;by:'ai'|'missing-material'}
export interface CandidateReviewField {proposalId:string;itemId:string;field:FieldKey;before:string;text:string;reasons:string[]}
export interface CandidateReviewInput {mode:'candidate-review';sourceIndex?:{sourceId:string;project:string;taskPath:string[]}[];meta:ReportMeta;items:ReportItem[];sources:SourceFragment[];candidate:CandidateReviewField[]}
export interface CandidateReviewProvider {review(input:CandidateReviewInput,signal:AbortSignal):Promise<unknown>}
export interface ReviewProgress {failedBatches?:number;retries?:number;completed:number;total:number;reviewedFields:number;resolvedFields:number;unresolvedFields:number;stage:string}
const compact=(s:string)=>s.replace(/\s/g,'')
const meaningful=(s:string)=>!!s.trim()&&!/^[/／—\-\s]*$/.test(s)
export function validateReviewResponse(value:unknown,input:CandidateReviewInput):ReviewDecision[]{
 if(!value||typeof value!=='object'||!Array.isArray((value as {decisions?:unknown}).decisions))throw new Error('AI复核返回格式无效')
 const values=(value as {decisions:unknown[]}).decisions,seen=new Set<string>()
 const decisions=values.map(raw=>{
  if(!raw||typeof raw!=='object')throw new Error('AI复核结论格式无效')
  const v=raw as Record<string,unknown>,field=input.candidate.find(c=>c.proposalId===v.proposalId)
  if(!field||seen.has(field.proposalId)||!['update','keep','unresolved'].includes(String(v.decision))||typeof v.text!=='string'||v.text.length>50000||typeof v.reason!=='string'||!v.reason.trim()||!Array.isArray(v.evidence))throw new Error('AI复核包含无效、重复或缺少依据的字段结论')
  seen.add(field.proposalId)
  const evidence:ReviewEvidence[]=[];let invalidEvidence=false
  for(const raw of v.evidence){
   if(!raw||typeof raw!=='object'){invalidEvidence=true;continue}
   const e=raw as Record<string,unknown>,source=input.sources.find(s=>s.id===e.sourceId),item=input.items.find(i=>i.id===field.itemId)
   if(!source||!item||!sourceInScope(source,item)||!rowCompatible(item,source,field.field)||typeof e.quote!=='string'||!compact(e.quote)||!compact(source.rawText).includes(compact(e.quote))){invalidEvidence=true;continue}
   evidence.push({sourceId:source.id,quote:e.quote})
  }
  let issue=''
  if(invalidEvidence)issue='AI提供的证据无法在报送原文中找到'
  else if(v.decision==='update'&&(!evidence.length||(!v.text.trim()&&meaningful(field.before))))issue='AI更新缺少有效原文证据或试图无依据清空内容'
  else if(v.decision==='keep'&&['current','next'].includes(field.field)&&meaningful(field.before)&&!evidence.length)issue='AI未提供确认保留所需的原文证据'
  return {proposalId:field.proposalId,decision:issue?'unresolved':v.decision as ReviewDecision['decision'],text:!issue&&v.decision==='update'?v.text:field.before,reason:issue?issue+'；'+v.reason.trim():v.reason.trim(),evidence:issue?[]:evidence}
 })
 if(seen.size!==input.candidate.length)throw new Error('AI未逐一复核全部候选字段，可继续重试该批次')
 return decisions
}
