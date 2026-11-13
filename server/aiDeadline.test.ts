// @vitest-environment node
import {afterEach,it,expect,vi} from 'vitest'
import {withAIDeadline} from './aiDeadline'
afterEach(()=>vi.useRealTimers())
it('超过旧120秒但未达到5分钟的正常响应仍可完成',async()=>{
 vi.useFakeTimers();let settled=false
 const work=withAIDeadline(async()=>new Promise<string>(resolve=>setTimeout(()=>resolve('完整结果'),150000))).then(v=>{settled=true;return v})
 await vi.advanceTimersByTimeAsync(120000);expect(settled).toBe(false)
 await vi.advanceTimersByTimeAsync(30000);expect(await work).toBe('完整结果');expect(vi.getTimerCount()).toBe(0)
})
it('达到5分钟即使传输未响应取消也结束等待并给出可重试超时',async()=>{
 vi.useFakeTimers()
 const work=withAIDeadline(async()=>new Promise<never>(()=>{}));const assertion=expect(work).rejects.toMatchObject({code:'AI_TIMEOUT',retryable:true})
 await vi.advanceTimersByTimeAsync(300000);await assertion;expect(vi.getTimerCount()).toBe(0)
})
it('用户暂停立即退出并清理计时器，不能作为超时重试',async()=>{
 vi.useFakeTimers();const controller=new AbortController()
 const work=withAIDeadline(async()=>new Promise<never>(()=>{}),controller.signal),assertion=expect(work).rejects.toMatchObject({code:'AI_CANCELLED',retryable:false})
 controller.abort();await assertion;expect(vi.getTimerCount()).toBe(0)
})
