import {afterEach,it,expect} from 'vitest'
import {render,screen,waitFor,fireEvent} from '@testing-library/react'
import {MemoryRouter,Routes,Route} from 'react-router-dom'
import {db} from '../../data/database'
import {createTask} from '../../data/taskRepository'
import {ExportPage} from './ExportPage'
import {makeWorkbookFixture,inline} from '../../../tests/fixtures/workbookFactory'
afterEach(async()=>{for(const table of db.tables)await table.clear()})
it('导出页面展示待办公式的具体位置，仍启用汇总表下载',async()=>{
 const header='<row r="5">'+['序号','企业名称','待办事项','完成情况'].map((s,i)=>inline(String.fromCharCode(65+i)+'5',s)).join('')+'</row>'
 const base='<sheetData>'+header+'<row r="6">'+inline('B6','甲')+inline('C6','旧待办')+'<c r="D6"><f>1+1</f><v>2</v></c></row></sheetData>'
 const source='<sheetData>'+header+'<row r="6">'+inline('B6','甲')+inline('C6','新待办')+'</row></sheetData>'
 const task=await createTask({totalIssue:89,weeklyIssue:39,periodStart:'2026-09-27',periodEnd:'2026-10-02',issueDate:'2026-10-03'},[{name:'上期.xlsx',role:'baseline',unit:'',bytes:new Uint8Array(makeWorkbookFixture([{name:'周例会待办事项',xml:base}]))},{name:'本期.xlsx',role:'source',unit:'甲',bytes:new Uint8Array(makeWorkbookFixture([{name:'周例会待办事项',xml:source}]))}],[])
 render(<MemoryRouter initialEntries={[`/tasks/${task.id}/export`]}><Routes><Route path="/tasks/:id/export" element={<ExportPage/>}/></Routes></MemoryRouter>)
 await screen.findByText(/待办表有 1 处需手动处理/);fireEvent.click(screen.getByText('查看具体位置'));expect(screen.getByText('周例会待办事项!D6 · 公式')).toBeVisible();await waitFor(()=>expect(screen.getByRole('button',{name:'下载本期汇总表'})).toBeEnabled())
})
