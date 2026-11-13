import {it,expect} from 'vitest'
import {makeWorkbookFixture,basicSheet} from '../../../tests/fixtures/workbookFactory'
import {readWorkbook} from './read'
import {planInsertions,applyInsertions} from './insert'
it('插行调整合并和原行号；有不支持关系时明确阻止',()=>{
 const b=readWorkbook(makeWorkbookFixture([{name:'专项工作',xml:basicSheet}]),'b')
 const request={sheet:'专项工作',row:7,templateRow:7,items:[{id:'new',reportId:'',category:'special' as const,unit:'新单位',project:'新任务',taskPath:[],fields:{unit:'新单位',content:'新工作'},targets:{}}]}
 const p=planInsertions(b,[request]);expect(p.blockers).toEqual([])
 expect(applyInsertions(b,p).sheets[0].cells.A8.text).toBe('乙单位')
 const unsafe=readWorkbook(makeWorkbookFixture([{name:'专项工作',xml:basicSheet+'<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/>'}]),'u')
 expect(planInsertions(unsafe,[request]).blockers.length).toBeGreaterThan(0)
})
it('工作簿级打印区域或手工分页尚未适配时拒绝自动插行',()=>{
 const b=readWorkbook(makeWorkbookFixture([{name:'专项工作',xml:basicSheet+'<rowBreaks count="1"><brk id="7" min="0" max="10" man="1"/></rowBreaks>'}]),'b')
 expect(planInsertions(b,[{sheet:'专项工作',row:7,templateRow:7,items:[{} as any]}]).blockers.length).toBeGreaterThan(0)
})
