// @vitest-environment node
import {it,expect} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {saveSnapshot} from './localSnapshots'
it('快照在服务控制目录写盘，失败不能伪称成功',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'report-snapshot-'))
 const file=await saveSnapshot({app:'weekly-report-tool',version:1,tasks:[]},dir)
 expect(JSON.parse(await readFile(join(dir,file),'utf8')).app).toBe('weekly-report-tool')
 await expect(saveSnapshot({app:'other',version:1},dir)).rejects.toThrow()
 await rm(dir,{recursive:true,force:true})
})
