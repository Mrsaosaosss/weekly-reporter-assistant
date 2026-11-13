import {it,expect} from 'vitest'
import {matchItems} from './match'
import {validateProposal,mergeHistory} from './rules'
import {measureCoverage} from './coverage'
import type {ReportItem,SourceFragment,Proposal} from '../model'
const item:ReportItem={id:'i',reportId:'r',category:'source',unit:'甲单位',project:'试验项目',taskPath:['原因分析'],fields:{history:'累计完成65/87支',status:'进行中'},targets:{}}
const s:SourceFragment={id:'s',unit:'乙单位',project:'试验项目',taskPath:['原因分析'],fields:{current:'计划完成1台'},refs:[],rawText:'计划完成1台'}
const p:Proposal={id:'p',reportId:'r',itemId:'i',field:'current',before:'',suggested:'已完成1台',sourceIds:['s'],warnings:[],batchId:'b',baseRevision:0}
it('同名事项不跨单位匹配',()=>expect(matchItems([item],[s])[0].sourceIds).toEqual([]))
it('计划不能提升为事实完成，未闭环不能自动闭环',()=>{
 expect(validateProposal(p,item,[s]).length).toBeGreaterThan(0)
 expect(validateProposal({...p,field:'status',suggested:'已闭环'},item,[{...s,rawText:'试验完成'}]).length).toBeGreaterThan(0)
})
it('拒绝伪造来源和未出现的数字',()=>{
 expect(validateProposal({...p,sourceIds:['unknown']},item,[s]).some(i=>i.severity==='error')).toBe(true)
 expect(validateProposal({...p,suggested:'完成99台'},item,[s]).length).toBeGreaterThan(0)
})
it('历史不重复追加，未使用来源不能静默消失',()=>{
 expect(mergeHistory('完成试验\n完成报告','完成报告')).toBe('完成试验\n完成报告')
 expect(measureCoverage([item],[s],[],{}).unmappedSources).toEqual(['s'])
})
