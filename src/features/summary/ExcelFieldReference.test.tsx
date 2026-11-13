import {render,screen,within} from '@testing-library/react'
import {expect,it} from 'vitest'
import {ExcelFieldReference} from './ExcelFieldReference'
import {readSummaryGroups} from '../../core/summary/summary'
import {readWorkbook} from '../../core/workbook/read'
import {basicSheet,inline,makeWorkbookFixture} from '../../../tests/fixtures/workbookFactory'

it('两列分别显示全部已映射单位的Excel原文及原始位置，明确区分空白与缺列',()=>{
 const xml=basicSheet.replace(inline('F6','计划评审'),inline('F6',''))
  .replace(inline('F7','无'),inline('F7','乙本期原文')+inline('G7','乙下周原文'))
 const book=readWorkbook(makeWorkbookFixture([{name:'源头质量问题',xml}]),'b')
 const groups=readSummaryGroups(book)
 const view=render(<ExcelFieldReference groups={groups} field="current" book={book} fileName="本期校核.xlsx"/>)
 const current=screen.getByRole('region',{name:'Excel 本周进展原文'})
 expect(current).toHaveTextContent('甲单位')
 expect(current).toHaveTextContent('乙单位')
 expect(current).toHaveTextContent('本周完成1台')
 expect(current).toHaveTextContent('乙本期原文')
 expect(current).not.toHaveTextContent('乙下周原文')
 expect(current).toHaveTextContent('源头质量问题!F5')
 expect(current).toHaveTextContent('原单元格为空')
 expect(within(current).getAllByRole('row')).toHaveLength(5)
 view.rerender(<ExcelFieldReference groups={groups} field="next" book={book} fileName="本期校核.xlsx"/>)
 const next=screen.getByRole('region',{name:'Excel 下周计划原文'})
 expect(next).toHaveTextContent('乙下周原文')
 expect(next).not.toHaveTextContent('乙本期原文')
 expect(next).toHaveTextContent('源头质量问题!G7')
 delete groups[0].rows[0].targets.next
 view.rerender(<ExcelFieldReference groups={groups} field="next" book={book} fileName="本期校核.xlsx"/>)
 expect(next).toHaveTextContent('Excel 未提供这一列')
})
