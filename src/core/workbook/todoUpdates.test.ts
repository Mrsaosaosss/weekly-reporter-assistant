import {expect,it} from 'vitest'
import type {ReportItem,SourceFragment} from '../model'
import {updatedTodoRows} from './todoUpdates'

it('待办只保留新事项、正文变化或新标注的行，且保持传入顺序',()=>{
 const row=(id:string,content:string,status:string):SourceFragment=>({id,category:'todo',unit:'山东风电',project:content,taskPath:[],refs:[],fields:{content,status},rawText:''})
 const same=row('same','已报事项','待办'),changed=row('changed','工作二','已完成'),marked=row('marked','工作三','进行中'),fresh=row('new','本期新增','')
 const baseline=[same,{...changed,fields:{...changed.fields,status:'待办'}},marked].map((r):ReportItem=>({...r,category:'todo',reportId:'r',targets:{}}))
 const historical=row('historic','旧会议事项','已完成');historical.fields.meetingDate='2026 年 9 月 5 日'
 expect(updatedTodoRows([same,changed,marked,historical,fresh],baseline,ref=>ref.id==='marked'&&!('targets' in ref),'2026-10-25').map(r=>r.id)).toEqual(['changed','marked','new'])
})
