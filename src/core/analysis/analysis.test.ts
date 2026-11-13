import {it,expect} from 'vitest'
import {validateAIResult} from './response'
import type {AnalysisInput} from './provider'
import {buildAnalysisInput} from './context'
const input:AnalysisInput={items:[{id:'i',reportId:'r',category:'source',unit:'甲',project:'项目',taskPath:[],fields:{current:'上期'},targets:{current:{fileId:'b',sheet:'源头质量问题',address:'K5'}}}],sources:[{id:'s',unit:'甲',project:'项目',taskPath:[],fields:{current:'本周完成1台'},refs:[],rawText:'本周完成1台'}],batchId:'b',baseRevision:0}
it('拒绝伪造来源、对象和不允许字段',()=>{
 expect(()=>validateAIResult({proposals:[{itemId:'i',field:'current',text:'完成',sourceIds:['fake']}]},input)).toThrow()
 expect(()=>validateAIResult({proposals:[{itemId:'other',field:'current',text:'完成',sourceIds:['s']}]},input)).toThrow()
 expect(()=>validateAIResult({proposals:[{itemId:'i',field:'execute',text:'完成',sourceIds:['s']}]},input)).toThrow()
})
it('合法来源进入审核仍保留来源ID',()=>expect(validateAIResult({proposals:[{itemId:'i',field:'current',text:'本周完成1台',sourceIds:['s']}]},input)[0].sourceIds).toEqual(['s']))
it('人工指定的对应关系优先于自动匹配',()=>{
 const renamed={...input.sources[0],project:'完全不同名称'}
 expect(buildAnalysisInput(input.items,[renamed],[{itemId:'i',sourceIds:['s'],ambiguous:false,reason:'人工关联'}])[0].sources[0].id).toBe('s')
})
