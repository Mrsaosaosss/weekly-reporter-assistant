import {it,expect} from 'vitest'
import {bulkChanges} from './bulkChanges'
import {readWorkbook} from '../workbook/read'
import {parseReport,suggestMappings} from './parse'
import {makeWorkbookFixture,basicSheet,inline} from '../../../tests/fixtures/workbookFactory'
const empty={decisions:{},sources:{},completed:[]}
function data(body=basicSheet){const book=readWorkbook(makeWorkbookFixture([{name:'源头质量问题',xml:body}]),'b'),source=readWorkbook(makeWorkbookFixture([{name:'源头质量问题',xml:basicSheet.replace('本周完成1台','新进展').replace('计划评审','另一新进展')}]),'s');return {book,items:parseReport(book,suggestMappings(book)).items,sources:parseReport(source,suggestMappings(source)).fragments}}
it('一键采用对同一共享目标的相互冲突来源跳过，其他明确目标照常采用',()=>{const {book,items,sources}=data();items[1].targets.current=items[0].targets.current;const result=bulkChanges(items,sources,empty,new Map([['b',book]]));expect(result.cells.some(c=>c.field==='current')).toBe(false);expect(result.skipped).toBeGreaterThan(0)})
it('一键采用不能覆盖共享公式从格，即使公式元素没有文字',()=>{const {book,items,sources}=data(basicSheet.replace(inline('F6','计划评审'),'<c r="F6"><f t="shared" si="0"/><v>7</v></c>'));const result=bulkChanges(items,sources,empty,new Map([['b',book]]));expect(result.cells.some(c=>c.itemId===items[1].id&&c.field==='current')).toBe(false);expect(result.cells.some(c=>c.itemId===items[0].id&&c.field==='current')).toBe(true)})

it('一键采用跳过数组公式中没有独立公式元素的成员格',()=>{const {book,items,sources}=data(basicSheet.replace(inline('F5','本周完成1台'),'<c r="F5"><f t="array" ref="F5:F6">{1;2}</f><v>1</v></c>').replace(inline('F6','计划评审'),'<c r="F6"><v>2</v></c>'));const result=bulkChanges(items,sources,empty,new Map([['b',book]]));expect(result.cells.some(c=>c.field==='current')).toBe(false)})
