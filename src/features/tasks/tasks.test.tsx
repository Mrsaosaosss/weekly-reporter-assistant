import {it,expect} from 'vitest'
import {render,screen,fireEvent} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {makeWorkbookFixture,basicSheet} from '../../../tests/fixtures/workbookFactory'
import {ImportPage} from './ImportPage'
it('导入入口区分上期底稿与本期材料，并有周期输入',async()=>{
 render(<MemoryRouter><ImportPage/></MemoryRouter>)
 expect(screen.getByLabelText('上期汇总表')).toHaveAttribute('accept','.xlsx')
 expect(screen.getByLabelText('本期材料：株洲所')).toHaveAttribute('multiple')
 expect(screen.getByLabelText('本期材料：山东风电')).toBeDisabled()
 expect(screen.getByLabelText('报告开始日期')).toBeVisible()
 const bytes=makeWorkbookFixture([{name:'源头质量问题',xml:basicSheet}])
 const baseline=new File([bytes],'上期.xlsx')
 Object.defineProperty(baseline,'arrayBuffer',{value:async()=>bytes})
 fireEvent.change(screen.getByLabelText('上期汇总表'),{target:{files:[baseline]}})
 const expected=await screen.findByLabelText(/预期报送单位/)
 fireEvent.change(expected,{target:{value:'株洲所、山东风电、福伊特'}})
 expect(screen.queryByLabelText('本期材料：福伊特')).not.toBeInTheDocument()
 expect(screen.getByLabelText('本期材料：山东风电')).toBeInTheDocument()
})
