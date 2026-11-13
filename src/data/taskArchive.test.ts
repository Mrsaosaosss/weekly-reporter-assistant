import {it,expect} from 'vitest'
import {ReportDatabase} from './database'
import {createTask} from './taskRepository'
import {exportTaskArchive,restoreTaskArchive,previewRestore,taskArchiveObject} from './taskArchive'
import {makeWorkbookFixture,basicSheet} from '../../tests/fixtures/workbookFactory'
it('任务及附件可恢复，损坏包拒绝且不损坏原数据',async()=>{
 const d=new ReportDatabase('archive-'+crypto.randomUUID()),e=new ReportDatabase('restore-'+crypto.randomUUID())
 const task=await createTask({totalIssue:89,weeklyIssue:39,periodStart:'2026-09-27',periodEnd:'2026-10-02',issueDate:'2026-10-03'},[{name:'上期.xlsx',role:'baseline',unit:'',bytes:new Uint8Array(makeWorkbookFixture([{name:'源头质量问题',xml:basicSheet}]))}],[],d)
 const blob=await exportTaskArchive(task.id,d);expect((await previewRestore(blob)).errors).toEqual([])
 const id=await restoreTaskArchive(blob,'new-copy',e,async()=>{})
 expect(id).not.toBe(task.id);expect(await e.items.count()).toBe(3);expect((await e.files.toArray())[0].bytes).toEqual((await d.files.toArray())[0].bytes)
 await expect(restoreTaskArchive(new Blob(['{"version":99}']),'replace',e,async()=>{})).rejects.toThrow()
 expect(await e.items.count()).toBe(3)
 await expect(restoreTaskArchive(blob,'replace',e,async()=>{throw new Error('disk')})).rejects.toThrow('disk')
 d.close();e.close();await d.delete();await e.delete()
})
it('多期自动快照可整体恢复为新副本，来源处置字典也重映射',async()=>{
 const d=new ReportDatabase('all-'+crypto.randomUUID()),e=new ReportDatabase('all-restore-'+crypto.randomUUID())
 const meta={totalIssue:89,weeklyIssue:39,periodStart:'2026-09-27',periodEnd:'2026-10-02',issueDate:'2026-10-03'}
 const bytes=new Uint8Array(makeWorkbookFixture([{name:'源头质量问题',xml:basicSheet}]))
 const a=await createTask(meta,[{name:'a.xlsx',bytes,role:'baseline',unit:''}],[],d)
 await createTask({...meta,totalIssue:90},[{name:'b.xlsx',bytes,role:'baseline',unit:''}],[],d)
 await d.fragments.put({id:'source-old',reportId:a.id,unit:'甲',project:'新增',taskPath:[],fields:{current:'新工作'},refs:[],rawText:'新工作'})
 await d.tasks.update(a.id,{exclusions:{'source-old':'不纳入本期'}})
 const blob=new Blob([JSON.stringify(await taskArchiveObject(undefined,d))])
 await restoreTaskArchive(blob,'new-copy',e,async()=>{})
 expect(await e.tasks.count()).toBe(2)
 const restoredSource=(await e.fragments.toArray())[0],task=await e.tasks.get(restoredSource.reportId)
 expect(task?.exclusions[restoredSource.id]).toBe('不纳入本期')
 expect(task?.exclusions['source-old']).toBeUndefined()
 d.close();e.close();await d.delete();await e.delete()
})
