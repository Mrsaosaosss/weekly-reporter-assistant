import {it,expect} from 'vitest'
import {compareCandidate,getLatestSnapshot} from './compare'
import {ReportDatabase} from '../../data/database'
import type {CandidateSnapshot,ParsedReport,ReportItem} from '../model'
const item:ReportItem={id:'i',reportId:'r',category:'source',unit:'甲单位',project:'项目',taskPath:['试验'],fields:{current:'累计完成2台'},targets:{current:{fileId:'f',sheet:'源头质量问题',address:'K5'}}}
const snapshot:CandidateSnapshot={id:'s',reportId:'r',items:[item],inputDigests:[],batchIds:[],frozenAt:'2026-11-02T00:00:00Z'}
it('数字差异待人工确认，不把字符串差异当最终事实判断',()=>{
 const reference:ParsedReport={items:[{...item,id:'ref',fields:{current:'累计完成3台'}}],fragments:[],warnings:[],mappings:[]}
 expect(compareCandidate(snapshot,reference)[0].type).toBe('facts')
 reference.items[0].fields.current='共完成两台'
 expect(compareCandidate(snapshot,reference)[0].confirmed).toBeUndefined()
 expect(snapshot.items[0].fields.current).toBe('累计完成2台')
})
it('按冻结时间而非随机UUID选择最新候选',async()=>{
 const d=new ReportDatabase('snapshot-order-'+crypto.randomUUID())
 await d.snapshots.bulkPut([{...snapshot,id:'z-old',frozenAt:'2026-11-01T00:00:00Z'},{...snapshot,id:'a-new',frozenAt:'2026-11-02T00:00:00Z'}])
 expect((await getLatestSnapshot('r',d))?.id).toBe('a-new');d.close();await d.delete()
})
