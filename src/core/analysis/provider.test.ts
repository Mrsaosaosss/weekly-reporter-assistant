import {afterEach,it,expect,vi} from 'vitest'
import {LocalDeepSeekProvider} from './provider'
const input={mode:'candidate-review' as const,meta:{totalIssue:93,weeklyIssue:43,periodStart:'2026-10-25',periodEnd:'2026-10-31',issueDate:'2026-11-01'},items:[],sources:[],candidate:[]}
afterEach(()=>vi.unstubAllGlobals())
it('浏览器Load failed网络错误统一变为可重试错误',async()=>{
 vi.stubGlobal('fetch',async()=>{throw new TypeError('Load failed')})
 await expect(new LocalDeepSeekProvider().review(input,new AbortController().signal)).rejects.toMatchObject({code:'AI_NETWORK',retryable:true})
})
it('读取响应时的网络失败也可重试，用户取消则不重试',async()=>{
 vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>{throw new TypeError('Load failed')}}))
 await expect(new LocalDeepSeekProvider().review(input,new AbortController().signal)).rejects.toMatchObject({code:'AI_NETWORK',retryable:true})
 const controller=new AbortController();controller.abort()
 await expect(new LocalDeepSeekProvider().review(input,controller.signal)).rejects.toMatchObject({code:'AI_CANCELLED',retryable:false})
})
