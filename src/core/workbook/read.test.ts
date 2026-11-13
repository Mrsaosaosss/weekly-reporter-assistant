import {it,expect} from 'vitest'
import {readWorkbook} from './read'
import {makeWorkbookFixture,basicSheet} from '../../../tests/fixtures/workbookFactory'
it('保留合并范围和原部件，拒绝损坏工作簿',()=>{
 const book=readWorkbook(makeWorkbookFixture([{name:'源头质量问题',xml:basicSheet}]),'f')
 expect(book.sheets[0].merges).toContain('A5:A6');expect(book.sheets[0].cells.F5.text).toBe('本周完成1台')
 expect(()=>readWorkbook(new ArrayBuffer(10),'bad')).toThrow()
})
