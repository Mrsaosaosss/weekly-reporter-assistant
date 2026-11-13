import {afterEach,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,waitFor,within} from '@testing-library/react'
import {MemoryRouter,Routes,Route} from 'react-router-dom'
import {db} from '../../data/database'
import {createTask} from '../../data/taskRepository'
import {IssueReviewPage} from './IssueReviewPage'
import {prepareExport} from '../../core/report/export'
import {makeWorkbookFixture,basicSheet} from '../../../tests/fixtures/workbookFactory'
afterEach(async()=>{for(const table of db.tables)await table.clear();vi.restoreAllMocks()})
it('实际页面连续选择、预览、两次撤销、刷新恢复与人工导出一致，全程不调用AI',async()=>{
 const task=await createTask({totalIssue:89,weeklyIssue:39,periodStart:'2026-09-27',periodEnd:'2026-10-02',issueDate:'2026-10-03'},[{role:'baseline',unit:'',name:'上期.xlsx',bytes:new Uint8Array(makeWorkbookFixture([{name:'源头质量问题',xml:basicSheet}]))},{role:'source',unit:'',name:'本期.xlsx',bytes:new Uint8Array(makeWorkbookFixture([{name:'源头质量问题',xml:basicSheet.replace('本周完成1台','本期进展').replace('计划评审','本期报告')}]))}],[])
 const network=vi.spyOn(globalThis,'fetch')
 const page=()=> <MemoryRouter initialEntries={[`/tasks/${task.id}/review`]}><Routes><Route path="/tasks/:id/review" element={<IssueReviewPage/>}/></Routes></MemoryRouter>
 const view=render(page())
 const first=await screen.findByRole('button',{name:'采用本期：原因分析 / 试验 / 本周具体工作进展'})
 expect(screen.queryByRole('columnheader',{name:'下周工作计划'})).not.toBeInTheDocument();expect(screen.getAllByRole('columnheader',{name:'本周具体工作进展'})).toHaveLength(2)
 await waitFor(()=>expect(first).toBeEnabled());fireEvent.click(first)
 await screen.findByRole('button',{name:'撤回采用：原因分析 / 试验 / 本周具体工作进展'})
 const second=screen.getByRole('button',{name:'采用本期：原因分析 / 报告 / 本周具体工作进展'});await waitFor(()=>expect(second).toBeEnabled());fireEvent.click(second)
 await waitFor(()=>expect(screen.getByText(/已采用 2 个单元格/)).toBeVisible())
 fireEvent.click(screen.getByRole('button',{name:'汇总结果'}));expect(within(screen.getByRole('table')).queryByText('本周完成1台')).not.toBeInTheDocument()
 await waitFor(()=>expect(screen.getByRole('button',{name:'撤销'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'撤销'}))
 await waitFor(()=>expect(screen.getByText(/已采用 1 个单元格/)).toBeVisible());await waitFor(()=>expect(screen.getByRole('button',{name:'撤销'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'撤销'}))
 await waitFor(()=>expect(screen.getByText(/已采用 0 个单元格/)).toBeVisible());expect((await prepareExport(task.id)).appliedCount).toBe(0)
 fireEvent.click(screen.getByRole('button',{name:'上下对照'}));await waitFor(()=>expect(screen.getByRole('button',{name:'采用本期：原因分析 / 试验 / 本周具体工作进展'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'采用本期：原因分析 / 试验 / 本周具体工作进展'}));await waitFor(()=>expect(screen.getByText(/已采用 1 个单元格/)).toBeVisible())
 view.unmount();render(page());await screen.findByRole('button',{name:'撤回采用：原因分析 / 试验 / 本周具体工作进展'});expect((await prepareExport(task.id)).appliedCount).toBe(1)
 expect(network.mock.calls.filter(([url])=>String(url).includes('/api/ai'))).toHaveLength(0)
})
it('全期一键采用不受当前问题筛选限制，并可一次撤销',async()=>{
 const task=await createTask({totalIssue:89,weeklyIssue:39,periodStart:'2026-09-27',periodEnd:'2026-10-02',issueDate:'2026-10-03'},[{role:'baseline',unit:'',name:'上期.xlsx',bytes:new Uint8Array(makeWorkbookFixture([{name:'源头质量问题',xml:basicSheet}]))},{role:'source',unit:'',name:'本期.xlsx',bytes:new Uint8Array(makeWorkbookFixture([{name:'源头质量问题',xml:basicSheet.replace('本周完成1台','甲新进展').replace('无','乙新进展')}]))}],[])
 render(<MemoryRouter initialEntries={[`/tasks/${task.id}/review`]}><Routes><Route path="/tasks/:id/review" element={<IssueReviewPage/>}/></Routes></MemoryRouter>)
 const adopt=await screen.findByRole('button',{name:'一键采用全部变化（2处）'});await waitFor(()=>expect(adopt).toBeEnabled());fireEvent.change(screen.getByRole('textbox',{name:'搜索问题'}),{target:{value:'甲单位'}});fireEvent.click(adopt)
 await waitFor(()=>expect(screen.getByText(/已采用 2 个单元格/)).toBeVisible());expect((await prepareExport(task.id)).changes.some(c=>c.unit==='乙单位'&&c.finalText==='乙新进展')).toBe(true)
 await screen.findByText('当前没有可一键采用的新变化。已采用或编辑的内容不会重复覆盖；可展开映射依据查看本期报送情况。');
 expect(screen.queryByRole('button',{name:/甲单位.*处内容变化/})).not.toBeInTheDocument();
 await waitFor(()=>expect(screen.getByRole('button',{name:'撤销上一步'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'撤销上一步'}));await waitFor(()=>expect(screen.getByText(/已采用 0 个单元格/)).toBeVisible());expect((await prepareExport(task.id)).appliedCount).toBe(0)
})
