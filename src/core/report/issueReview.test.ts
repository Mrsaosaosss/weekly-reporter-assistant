import {sameText} from './issueReview'
import {it,expect} from 'vitest'
import {groupIssues,resolveIssueSource,cellDecision} from './issueReview'
import type {ReportItem,SourceFragment,ManualReviewState} from '../model'
const item=(id:string,description='D05叶片断裂',address='C5'):ReportItem=>({id,reportId:'r',category:'source',unit:'株洲所',project:'盐沙坪',taskPath:['根因分析'],fields:{description,current:'上期'},targets:{description:{fileId:'b',sheet:'源头质量问题',address},current:{fileId:'b',sheet:'源头质量问题',address:'J5'}}})
const source=(id:string,description='D05叶片断裂'):SourceFragment=>({id,category:'source',unit:'株洲所',project:'盐沙坪',taskPath:['根因分析'],fields:{description,current:''},refs:[],rawText:''})
const state:ManualReviewState={decisions:{},sources:{},completed:[]}
it('同一描述合并格的子项整块显示，同项目另一故障独立分组',()=>{const groups=groupIssues([item('a'),{...item('b'),taskPath:['现场处置']},item('c','D06叶片断裂','C10')]);expect(groups).toHaveLength(2);expect(groups[0].items.map(i=>i.id)).toEqual(['a','b'])})
it('同项目同子项不同问题不自动匹配，重复报送保留上期',()=>{expect(resolveIssueSource(item('a'),[source('wrong','D06叶片断裂')],state).source).toBeUndefined();expect(resolveIssueSource(item('a'),[source('s'),source('s2')],state).source).toBeUndefined();expect(resolveIssueSource(item('a'),[source('s'),source('s2')],{...state,sources:{a:'s2'}}).source).toBeUndefined()})
it('独立子行不跨行匹配，源空白保持为空而非缺报',()=>{const a={...item('a'),rowContext:{row:17,start:17,index:0,size:2,sharedFields:[]}},s={...source('s'),rowContext:{row:27,start:26,index:1,size:2,sharedFields:[]}};expect(resolveIssueSource(a,[s],state).source).toBeUndefined();expect(resolveIssueSource(item('a'),[source('blank')],state).source?.fields.current).toBe('')})
it('共享目标的人工选择在不同子项上保持一致',()=>{const a=item('a'),b=item('b');expect(cellDecision([a,b],b,'current',{...state,decisions:{a:{current:{itemId:'a',field:'current',mode:'edit',text:'共享新值'}}}})?.text).toBe('共享新值')})
it('恢复副本使ID排序改变后仍按物理行归组并读取共享格决定',()=>{
 const first={...item('z'),rowContext:{row:5,start:5,index:0,size:1,sharedFields:[]}},second={...item('a'),rowContext:{row:6,start:6,index:0,size:1,sharedFields:[]}}
 const restored={...state,completed:['z'],decisions:{z:{current:{itemId:'z',field:'current' as const,mode:'edit' as const,text:'恢复后新值'}}}}
 expect(groupIssues([second,first])[0].id).toBe('z')
 expect(cellDecision([second,first],second,'current',restored)?.text).toBe('恢复后新值')
})
it('批量问题按部件厂路由，并拒绝主机厂报送的同名事项',()=>{
 const target:ReportItem={...item('b'),category:'batch',project:'齿轮箱故障',fields:{supplier:'戚墅堰所',description:'上期概况'}}
 const row=(id:string,reportingUnit:string):SourceFragment=>({...source(id),category:'batch',project:target.project,reportingUnit,fields:{description:'本期概况',current:'已完成'},refs:[{fileId:id,sheet:'批量质量问题',address:'A5'}]})
 expect(resolveIssueSource(target,[row('wrong','株洲所'),row('right','戚墅堰所')],state).source?.id).toBe('right')
})

it('福伊特问题随主机厂分别取数，不能使用福伊特直接报送',()=>{
 const target:ReportItem={...item('b'),category:'batch',project:'齿轮箱低速轴批量漏油问题',unit:'山东风电',fields:{supplier:'福伊特'},taskPath:['现场处置','应急处理']}
 const row=(id:string,reportingUnit:string,unit:string):SourceFragment=>({...source(id),category:'batch',project:target.project,unit,reportingUnit,taskPath:target.taskPath,fields:{supplier:'福伊特',current:id},refs:[{fileId:id,sheet:'批量质量问题',address:'L10'}]})
 const sources=[row('山东最新','山东风电','山东风电'),row('株洲所同名','株洲所','株洲所'),row('福伊特直接','福伊特','山东风电')]
 expect(resolveIssueSource(target,sources,state).source?.id).toBe('山东最新')
 expect(resolveIssueSource({...target,unit:'株洲所'},sources,state).source?.id).toBe('株洲所同名')
})

it.each(['6.25MW江苏中车电机挡边带脱落批量问题','发电机轴承漏脂批量问题'])('工作内容数量变化不阻挡 %s 的唯一现场处置进展',project=>{
 const target:ReportItem={...item('batch'),category:'batch',project,fields:{supplier:'株洲电机'},taskPath:['现场处置','两处风场共64台']}
 const latest:SourceFragment={...source('latest'),category:'batch',project,reportingUnit:'株洲电机',taskPath:['现场处置','四处风场共75台'],fields:{supplier:'株洲电机',current:'本期完成4台，累计45台'},refs:[{fileId:'src',sheet:'批量质量问题',address:'L6'}]}
 expect(resolveIssueSource(target,[latest],state,[target]).source?.id).toBe('latest')
 expect(resolveIssueSource(target,[latest,{...latest,id:'another'}],state,[target]).source).toBeUndefined()
 const peer={...target,id:'second',taskPath:['现场处置','另一独立工作']}
 expect(resolveIssueSource(target,[latest],state,[target,peer]).source).toBeUndefined()
})

it('海西交付项目改名及州洲写法变化仍逐项对应，施工与调试不混填',()=>{
 const target:ReportItem={...item('special'),category:'special',project:'海西、喀什项目交付',taskPath:['海西洲项目兰州公司塔筒交付（61套）']}
 const row=(id:string,content:string):SourceFragment=>({...source(id),category:'special',project:'海西州项目交付',taskPath:[content],fields:{current:id},refs:[{fileId:'src',sheet:'专项工作',address:'K13'}]})
 const sources=[row('最新塔筒','海西州项目兰州公司塔筒交付（61套）'),row('最新施工','施工进度'),row('最新调试','调试进度')]
 expect(resolveIssueSource(target,sources,state).source?.id).toBe('最新塔筒')
 expect(resolveIssueSource({...target,taskPath:['施工进度']},sources,state).source?.id).toBe('最新施工')
 expect(resolveIssueSource({...target,project:'其他项目交付'},sources,state).source).toBeUndefined()
})

 it('仅两侧均为占位符才视为一致，正文符号保留',()=>{expect(sameText('/', '—')).toBe(true);expect(sameText('已完成','/')).toBe(false);expect(sameText('/','已完成')).toBe(false);expect(sameText('A/B','A-B')).toBe(false)})
