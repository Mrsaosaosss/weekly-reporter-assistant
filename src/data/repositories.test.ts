import {it,expect} from 'vitest'
import {ReportDatabase} from './database'
import {createTask,prepareNextTaskImport} from './taskRepository'
import {applyReview} from './reviewRepository'
import {makeWorkbookFixture,basicSheet} from '../../tests/fixtures/workbookFactory'
it('保存任务附件并用修订号防止旧审核覆盖',async()=>{
 const d=new ReportDatabase('test-'+crypto.randomUUID())
 const bytes=new Uint8Array(makeWorkbookFixture([{name:'源头质量问题',xml:basicSheet}]))
 const task=await createTask({totalIssue:89,weeklyIssue:39,periodStart:'2026-09-27',periodEnd:'2026-10-02',issueDate:'2026-10-03'},[{name:'底稿.xlsx',bytes,role:'baseline',unit:''}],[],d)
 expect(await d.files.count()).toBe(1);expect(await d.items.count()).toBe(3)
 await d.proposals.put({id:'p',reportId:task.id,itemId:(await d.items.toArray())[0].id,field:'current',before:'',suggested:'完成',sourceIds:[],warnings:['缺报'],batchId:'b',baseRevision:0})
 await applyReview({reportId:task.id,proposalId:'p',decision:'keep',note:'保留上期作为历史参考',expectedRevision:0},d)
 await expect(applyReview({reportId:task.id,proposalId:'p',decision:'keep',note:'old',expectedRevision:0},d)).rejects.toThrow(/变化/)
 expect((await d.reviews.get('p'))?.decision).toBe('keep')
 d.close();await d.delete()
})
it('下一期先准备可补充材料的导入底稿，而不是直接进入空来源审核',async()=>{
 const d=new ReportDatabase('next-'+crypto.randomUUID()),bytes=new Uint8Array(makeWorkbookFixture([{name:'源头质量问题',xml:basicSheet}]))
 const task=await createTask({totalIssue:89,weeklyIssue:39,periodStart:'2026-09-27',periodEnd:'2026-10-02',issueDate:'2026-10-03'},[{name:'底稿.xlsx',bytes,role:'baseline',unit:''}],['甲单位'],d)
 await d.tasks.update(task.id,{status:'archived'})
 await d.exports.put({id:'e',reportId:task.id,createdAt:'2026-10-03',bytes,changes:bytes,taskRevision:0,partial:false})
 const next=await prepareNextTaskImport(task.id,d)
 expect(next.meta.totalIssue).toBe(90);expect(next.inputs[0].role).toBe('baseline');expect(next.expectedUnits).toEqual(['甲单位'])
 expect(await d.tasks.count()).toBe(1)
 d.close();await d.delete()
})
