import {AIRequestError} from '../src/core/analysis/requestError'
export async function withAIDeadline<T>(operation:(signal:AbortSignal)=>Promise<T>,parent?:AbortSignal,timeoutMs=300000):Promise<T>{
 const controller=new AbortController();let timedOut=false
 let rejectStop!:(error:Error)=>void
 const interrupted=new Promise<never>((_,reject)=>{rejectStop=reject})
 const cancel=()=>{controller.abort(parent?.reason);rejectStop(new AIRequestError('AI复核已暂停，已完成结果保留','AI_CANCELLED'))}
 if(parent?.aborted)throw new AIRequestError('AI复核已暂停，已完成结果保留','AI_CANCELLED')
 parent?.addEventListener('abort',cancel,{once:true})
 const timer=setTimeout(()=>{timedOut=true;controller.abort();rejectStop(new AIRequestError('本批AI响应超时，将拆小重试；已完成结果保留','AI_TIMEOUT',true))},timeoutMs)
 try{return await Promise.race([operation(controller.signal),interrupted])}catch(e){
  if(parent?.aborted)throw new AIRequestError('AI复核已暂停，已完成结果保留','AI_CANCELLED')
  if(timedOut||e instanceof Error&&(e.name==='TimeoutError'||/timed out|due to timeout/i.test(e.message)))throw new AIRequestError('本批AI响应超时，将拆小重试；已完成结果保留','AI_TIMEOUT',true)
  if(e instanceof TypeError)throw new AIRequestError('连接AI服务暂时失败，将重试；已完成结果保留','AI_NETWORK',true)
  throw e
 }finally{clearTimeout(timer);parent?.removeEventListener('abort',cancel)}
}
