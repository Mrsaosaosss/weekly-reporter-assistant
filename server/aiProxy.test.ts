// @vitest-environment node
import {it,expect} from 'vitest'
import {requestAllowed} from './requestBoundary'
import {callAI,aiPlugin} from './aiProxy'
import {snapshotPlugin} from './localSnapshots'
it('拒绝跨站请求和伪造本机Host',()=>{
 expect(requestAllowed({host:'localhost:5188',origin:'https://evil.example'})).toBe(false)
 expect(requestAllowed({host:'evil.example',origin:'http://localhost:5188'})).toBe(false)
 expect(requestAllowed({host:'localhost:5188',origin:'http://localhost:5188'})).toBe(true)
})
it('缺配置和服务失败提供明确错误而不泄露密钥',async()=>{
 await expect(callAI({},{})).rejects.toThrow(/配置/)
 await expect(callAI({AI_BASE_URL:'https://api.deepseek.com',AI_MODEL:'deepseek-flash',AI_API_KEY:'secret'},{items:[],sources:[]},async()=>new Response('secret',{status:401}))).rejects.toThrow('AI 服务返回 401')
})
it('注册中间件不返回会被Vite执行的错误钩子',()=>{
 const server={middlewares:{use:()=>()=>{throw new Error('不可当作post hook')}}}
 for(const plugin of [aiPlugin({}),snapshotPlugin()])expect((plugin.configureServer as Function)(server)).toBeUndefined()
})
it('复核模式向AI发送初稿和原文，要求结构化复核结论',async()=>{
 let sent:any
 await callAI({AI_BASE_URL:'https://api.deepseek.com',AI_MODEL:'configured',AI_API_KEY:'secret'},{mode:'candidate-review',items:[],sources:[],candidate:[]},async(_url,init)=>{sent=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:'{"decisions":[]}'}}]}))})
 expect(sent.messages[0].content).toContain('decisions')
 expect(sent.messages[0].content).toContain('unresolved')
 expect(JSON.parse(sent.messages[1].content).mode).toBe('candidate-review')
})
it('新版DeepSeek复核响应截断时增加额度重试，不把截断JSON作为结果',async()=>{
 let calls=0
 const result=await callAI({AI_BASE_URL:'https://api.deepseek.com',AI_MODEL:'deepseek-flash',AI_API_KEY:'secret'},{mode:'candidate-review',items:[],sources:[],candidate:[]},async()=>{calls++;return new Response(JSON.stringify({choices:[calls===1?{finish_reason:'length',message:{content:'{"decisions":['}}:{finish_reason:'stop',message:{content:'{"decisions":[]}'}}]}))})
 expect(result).toEqual({decisions:[]});expect(calls).toBe(2)
})
it('超时返回可识别的中文错误，而非直接暴露英文Abort异常',async()=>{
 await expect(callAI({AI_BASE_URL:'https://api.deepseek.com',AI_MODEL:'deepseek-flash',AI_API_KEY:'secret'},{mode:'candidate-review',items:[],sources:[],candidate:[]},async()=>{throw new DOMException('The operation was aborted due to timeout','TimeoutError')})).rejects.toMatchObject({code:'AI_TIMEOUT',retryable:true,message:expect.stringContaining('超时')})
})
